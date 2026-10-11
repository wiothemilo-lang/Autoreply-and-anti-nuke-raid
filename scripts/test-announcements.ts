// TEST: thông báo cập nhật + bản cập nhật hiện tại (convex/announcements.ts).
//
// Chạy: bun scripts/test-announcements.ts
//
// Vì sao test này tồn tại: đây là bề mặt admin GHI công khai lên web —
//   1. Sai quyền = người lạ đăng thông báo giả mạo được cho mọi khách
//      (requireBotAdmin phải chặn cả list lẫn ghi).
//   2. Sai lọc active = bài admin đã ẨN vẫn hiện cho người dùng — bài cũ
//      không bao giờ tắt được.
//   3. Sai thứ tự = web hiện thông báo CŨ thay vì bài mới nhất.
//   4. Không kẹp độ dài = form dài quá vẫn ghi được (payload rác to).
//
// Hermetic: không mạng, không DB thật — ctx giả trong nhớ, gọi thẳng
// `._handler` của Convex (cùng khuôn test-payments / test-team-admins).
import { adminList, publicFeed, remove, save, setSiteInfo } from "../convex/announcements";
import { CURRENT_SESSION_AUTH_VERSION } from "../convex/auth";

let pass = 0;
let fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(ok ? `  ✅ ${label}` : `  ❌ ${label}`);
  if (!ok) {
    fail++;
    if (detail !== undefined) console.log("     ", detail);
  } else pass++;
};

async function expectThrows(label: string, fn: () => Promise<unknown>, needle: string) {
  try {
    await fn();
    check(label, false, "không ném lỗi");
  } catch (e: any) {
    check(label, String(e?.message ?? e).includes(needle), e?.message ?? e);
  }
}

type Row = Record<string, any>;

/**
 * Ctx giả: query/withIndex/order/first/collect/take + get/insert/patch/delete.
 * `order("desc")` đảo mảng (dữ liệu test luôn được đẩy theo thứ tự tạo mới →
 * đúng nghĩa "mới nhất trước" của index đơn).
 */
function makeCtx(tables: Record<string, Row[]>) {
  let idSeq = 0;
  const allRows = () => Object.values(tables).flat();
  const view = (out: Row[]): any => ({
    first: async () => out[0] ?? null,
    collect: async () => out,
    take: async (n: number) => out.slice(0, n),
    order: (dir?: string) => view(dir === "desc" ? [...out].reverse() : [...out]),
  });
  const db = {
    query: (table: string) => {
      const rows = tables[table] ?? [];
      return {
        withIndex: (_name: string, bound?: (q: any) => any) => {
          const caps: Array<{ f: string; op: string; v: any }> = [];
          const q: any = {
            eq: (f: string, v: any) => (caps.push({ f, op: "eq", v }), q),
            gte: (f: string, v: any) => (caps.push({ f, op: "gte", v }), q),
            lte: (f: string, v: any) => (caps.push({ f, op: "lte", v }), q),
            lt: (f: string, v: any) => (caps.push({ f, op: "lt", v }), q),
            field: (f: string) => f,
          };
          bound?.(q);
          const out = rows.filter((r) =>
            caps.every(({ f, op, v }) =>
              op === "eq"
                ? r[f] === v
                : op === "gte"
                  ? r[f] >= v
                  : op === "lte"
                    ? r[f] <= v
                    : r[f] < v,
            ),
          );
          return view(out);
        },
        ...view(rows),
      };
    },
    get: async (id: string) => allRows().find((r) => r._id === id) ?? null,
    insert: async (table: string, row: Row) => {
      const _id = `id${++idSeq}`;
      (tables[table] ??= []).push({ ...row, _id });
      return _id;
    },
    patch: async (id: string, patch: Row) => {
      const r = allRows().find((x) => x._id === id);
      if (r) Object.assign(r, patch);
    },
    delete: async (id: string) => {
      for (const arr of Object.values(tables)) {
        const i = arr.findIndex((r) => r._id === id);
        if (i >= 0) {
          arr.splice(i, 1);
          return;
        }
      }
    },
  };
  return { db } as any;
}

const OWNER = "123456789012345678";
const TEAM = "555555555555555555";
const STRANGER = "999999999999999999";

function seed(opts: { team?: boolean } = {}) {
  const t = Date.now();
  const tables: Record<string, Row[]> = {
    users: [
      { _id: "u1", discordId: OWNER, username: "tester", globalName: "Tester" },
      { _id: "u_x", discordId: STRANGER, username: "stranger" },
      ...(opts.team
        ? [{ _id: "u_team", discordId: TEAM, username: "team", globalName: "Team Member" }]
        : []),
    ],
    sessions: [
      {
        _id: "s1",
        token: "tok-good",
        userId: "u1",
        createdAt: t,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
      {
        _id: "s_x",
        token: "tok-x",
        userId: "u_x",
        createdAt: t,
        authVersion: CURRENT_SESSION_AUTH_VERSION,
      },
      ...(opts.team
        ? [
            {
              _id: "s_team",
              token: "tok-team",
              userId: "u_team",
              createdAt: t,
              authVersion: CURRENT_SESSION_AUTH_VERSION,
            },
          ]
        : []),
    ],
    botStatus: [
      {
        _id: "bot1",
        kind: "status",
        ownerDiscordId: OWNER,
        teamAdminDiscordIds: opts.team ? [TEAM] : [],
      },
    ],
    announcements: [],
    siteInfo: [],
  };
  return tables;
}

const adminListH = (adminList as any)._handler;
const saveH = (save as any)._handler;
const removeH = (remove as any)._handler;
const setH = (setSiteInfo as any)._handler;
const feedH = (publicFeed as any)._handler;

const run = async () => {
  console.log("── announcements: quyền + CRUD ──");
  check(
    "lấy được handler của 5 functions",
    [adminListH, saveH, removeH, setH, feedH].every((f) => typeof f === "function"),
  );

  // (1) Chủ bot đăng bài → hiện ở adminList + publicFeed
  {
    const tables = seed();
    const res = await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Bản cập nhật 1.4.0",
      body: "Thêm thanh thông báo toàn trang.",
      version: "1.4.0",
      active: true,
    });
    const row = tables.announcements[0];
    check(
      "chủ bot đăng được bài (đúng nội dung + gắn tên tác giả)",
      res.ok === true &&
        row?.title === "Bản cập nhật 1.4.0" &&
        row.body.includes("toàn trang") &&
        row.version === "1.4.0" &&
        row.active === true &&
        row.authorDiscordId === OWNER,
      row,
    );
    const list = await adminListH(makeCtx(tables), { token: "tok-good" });
    check(
      "adminList trả bài kèm tên tác giả đã tra từ users",
      list.length === 1 && list[0].authorName === "Tester" && list[0].version === "1.4.0",
      list[0],
    );
    const feed = await feedH(makeCtx(tables), {});
    check(
      "publicFeed trả đúng bài active mới nhất",
      feed.notice?.title === "Bản cập nhật 1.4.0" && feed.currentVersion === null,
      feed,
    );
  }

  // (2) Quản trị viên nhóm đăng được; người lạ thì KHÔNG
  {
    const tables = seed({ team: true });
    const teamRes = await saveH(makeCtx(tables), {
      token: "tok-team",
      title: "Bảo trì",
      body: "Web bảo trì 15 phút.",
      active: true,
    });
    check("quản trị viên nhóm đăng được thông báo", teamRes.ok === true);

    await expectThrows(
      "người lạ đăng được không? KHÔNG — bị requireBotAdmin chặn",
      () =>
        saveH(makeCtx(tables), {
          token: "tok-x",
          title: "Giả mạo",
          body: "Không được",
          active: true,
        }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
    await expectThrows(
      "người lạ không đọc được danh sách admin",
      () => adminListH(makeCtx(tables), { token: "tok-x" }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
    await expectThrows(
      "người lạ không đặt được bản cập nhật hiện tại",
      () => setH(makeCtx(tables), { token: "tok-x", currentVersion: "9.9.9" }),
      "Chỉ chủ sở hữu bot hoặc quản trị viên nhóm",
    );
    await expectThrows(
      "chưa đăng nhập (token rỗng) → bị chặn ngay",
      () => adminListH(makeCtx(tables), { token: "" }),
      "Vui lòng đăng nhập",
    );
    check(
      "người lạ không để lại bài nào trong bảng",
      tables.announcements.length === 1,
      tables.announcements,
    );
  }

  // (3) Validation độ dài ở SERVER
  {
    const tables = seed();
    await expectThrows(
      "tiêu đề rỗng → chặn",
      () => saveH(makeCtx(tables), { token: "tok-good", title: "   ", body: "x", active: true }),
      "Tiêu đề không được để trống",
    );
    await expectThrows(
      "nội dung rỗng → chặn",
      () => saveH(makeCtx(tables), { token: "tok-good", title: "x", body: "  ", active: true }),
      "Nội dung không được để trống",
    );
    await expectThrows(
      "tiêu đề 121 ký tự → chặn (trần 120)",
      () =>
        saveH(makeCtx(tables), {
          token: "tok-good",
          title: "a".repeat(121),
          body: "x",
          active: true,
        }),
      "Tiêu đề tối đa 120 ký tự",
    );
    await expectThrows(
      "nội dung 4001 ký tự → chặn (trần 4000)",
      () =>
        saveH(makeCtx(tables), {
          token: "tok-good",
          title: "x",
          body: "b".repeat(4001),
          active: true,
        }),
      "Nội dung tối đa 4000 ký tự",
    );
    await expectThrows(
      "phiên bản 33 ký tự → chặn (trần 32)",
      () =>
        saveH(makeCtx(tables), {
          token: "tok-good",
          title: "x",
          body: "b",
          version: "v".repeat(33),
          active: true,
        }),
      "Phiên bản tối đa 32 ký tự",
    );
    check("lỗi validation KHÔNG để lại bài nào", tables.announcements.length === 0);
  }

  // (4) Sửa bài: giữ createdAt, đổi updatedAt; version rỗng = XOÁ nhãn
  {
    const tables = seed();
    const created = await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Bản 1.0",
      body: "Nội dung gốc.",
      version: "1.0",
      active: true,
    });
    const before = { ...tables.announcements[0] };
    const updated = await saveH(makeCtx(tables), {
      token: "tok-good",
      id: created.id,
      title: "Bản 1.0.1 (sửa)",
      body: "Nội dung đã sửa.",
      version: "",
      active: true,
    });
    const after = tables.announcements[0];
    check(
      "sửa bài: giữ nguyên createdAt (không nhảy lên đầu), đổi updatedAt, version rỗng → xóa nhãn",
      updated.id === created.id &&
        after.createdAt === before.createdAt &&
        after.updatedAt >= before.updatedAt &&
        after.title === "Bản 1.0.1 (sửa)" &&
        after.version === undefined,
      after,
    );
    await expectThrows(
      "sửa bài không tồn tại → báo rõ (không im lặng)",
      () =>
        saveH(makeCtx(tables), {
          token: "tok-good",
          id: "khong-ton-tai",
          title: "x",
          body: "y",
          active: true,
        }),
      "không tồn tại",
    );
  }

  // (5) ẨN bài: admin vẫn thấy, web KHÔNG thấy
  {
    const tables = seed();
    const a = await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Thông báo ẩn",
      body: "Đã hết hạn.",
      active: true,
    });
    await saveH(makeCtx(tables), {
      token: "tok-good",
      id: a.id,
      title: "Thông báo ẩn",
      body: "Đã hết hạn.",
      active: false,
    });
    const feed = await feedH(makeCtx(tables), {});
    const list = await adminListH(makeCtx(tables), { token: "tok-good" });
    check(
      "bài đã ẨN biến mất khỏi web nhưng vẫn trong danh sách admin",
      feed.notice === null && list.length === 1 && list[0].active === false,
      { feed, list },
    );
  }

  // (6) Thứ tự: bài MỚI nhất thắng kể cả khi có nhiều bài active
  {
    const tables = seed();
    await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Bài cũ",
      body: "Cũ hơn.",
      active: true,
    });
    await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Bài mới",
      body: "Mới hơn.",
      active: true,
    });
    const feed = await feedH(makeCtx(tables), {});
    const list = await adminListH(makeCtx(tables), { token: "tok-good" });
    check(
      "publicFeed lấy bài MỚI nhất, adminList xếp mới trước",
      feed.notice?.title === "Bài mới" && list[0].title === "Bài mới",
      { feed: feed.notice?.title, list: list.map((r: any) => r.title) },
    );
  }

  // (7) Xoá bài
  {
    const tables = seed();
    const a = await saveH(makeCtx(tables), {
      token: "tok-good",
      title: "Sắp xoá",
      body: "Xoá đi.",
      active: true,
    });
    await removeH(makeCtx(tables), { token: "tok-good", id: a.id });
    const feed = await feedH(makeCtx(tables), {});
    const list = await adminListH(makeCtx(tables), { token: "tok-good" });
    check("xoá bài → web và danh sách admin đều trống", feed.notice === null && list.length === 0, {
      feed,
      list,
    });
    await expectThrows(
      "xoá bài đã bị xoá trước đó → báo rõ thay vì im lặng",
      () => removeH(makeCtx(tables), { token: "tok-good", id: a.id }),
      "không tồn tại",
    );
  }

  // (8) siteInfo: bản cập nhật hiện tại (insert → patch → xoá trắng)
  {
    const tables = seed();
    const first = await setH(makeCtx(tables), { token: "tok-good", currentVersion: "1.4.0" });
    let feed = await feedH(makeCtx(tables), {});
    check(
      "đặt bản cập nhật lần đầu → publicFeed trả nhãn v1.4.0",
      first.ok === true && feed.currentVersion === "1.4.0" && tables.siteInfo.length === 1,
      { first, feed },
    );
    await setH(makeCtx(tables), { token: "tok-good", currentVersion: "1.5.0" });
    feed = await feedH(makeCtx(tables), {});
    check(
      "đặt lần hai → CẬP NHẬT dòng cũ (không tạo dòng đôi), web thấy 1.5.0",
      feed.currentVersion === "1.5.0" && tables.siteInfo.length === 1,
      { feed, rows: tables.siteInfo.length },
    );
    await setH(makeCtx(tables), { token: "tok-good", currentVersion: "   " });
    feed = await feedH(makeCtx(tables), {});
    check(
      "xoá trắng → currentVersion null (web ẩn nhãn, không hiện chuỗi rỗng)",
      feed.currentVersion === null,
      feed,
    );
    await expectThrows(
      "bản cập nhật 33 ký tự → chặn (trần 32)",
      () => setH(makeCtx(tables), { token: "tok-good", currentVersion: "9".repeat(33) }),
      "Bản cập nhật tối đa 32 ký tự",
    );
  }

  // (9) Feed rỗng + trần danh sách admin
  {
    const tables = seed();
    const feed = await feedH(makeCtx(tables), {});
    check(
      "chưa có gì → publicFeed rỗng sạch (không lỗi)",
      feed.notice === null && feed.currentVersion === null,
      feed,
    );
    for (let i = 0; i < 55; i++) {
      await saveH(makeCtx(tables), {
        token: "tok-good",
        title: `Bài ${i}`,
        body: `Nội dung ${i}`,
        active: false,
      });
    }
    const list = await adminListH(makeCtx(tables), { token: "tok-good" });
    check(
      "adminList kẹp 50 bài mới nhất (không kéo cả bảng)",
      list.length === 50 && list[0].title === "Bài 54" && list[49].title === "Bài 5",
      list.length,
    );
  }

  console.log(`\n${pass}/${pass + fail} assertion xanh`);
  if (fail > 0) process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
