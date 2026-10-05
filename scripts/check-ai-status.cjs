#!/usr/bin/env node
/**
 * scripts/check-ai-status.cjs — chặn việc MẤT thông tin chẩn đoán chuỗi
 * provider AI ở action `haimiya:aiStatus`.
 *
 * Bối cảnh (lỗi thật 05/10/2026): `haimiya:ask` chết vì `AI_API_KEY` của
 * gateway sai. Gỡ băng keo "thử provider kế tiếp" thì Haimiya sống lại — nhưng
 * câu hỏi mới mọc lên: có bao nhiêu key AI trên deployment, cái nào đứng đầu?
 * Không có ai trả lời được mà không cần tự đoán. Vì vậy `aiStatus` được thêm
 * `providerCount`.
 *
 * Vì sao cần CỔNG chứ không ghi vào tài liệu:
 *  - `aiStatus` có TỚI HAI nhánh `return` (nhánh rate-limit và nhánh thường).
 *    Lần sửa sau thêm nhánh thứ ba — ví dụ nhánh "AI đang bị khoá" — là người
 *    ta quên `providerCount`, và chẩn đoán biến mất NGAY TRONG CHÍNH LÚC đang
 *    cần nó nhất. Không ai để ý cho tới khi lại debug từ đầu.
 *  - `providerCount` đếm DANH SÁCH provider. Ai đó "tiện tay" viết
 *    `providerCount: p ? 1 : 0` (số provider ĐẦU) thì con số sai lệch đúng kiểu
 *    im lặng: lúc cần thì lại luôn ra 1, giống hệt chuyện "chỉ có 1 key".
 *  - `aiStatus` là action PUBLIC (không cần đăng nhập) nên nó là nơi duy nhất
 *    chẩn đoán được khi hệ thống đang chết. Trả nhầm khoá API ra đó là lộ
 *    secret cho bất kỳ ai gọi endpoint.
 *
 * Cổng này quét CẤU TRÚC (cân bằng ngoặc, tự tìm mọi object literal trả về
 * trong action), không phải so tên field — nên thêm/sửa nhánh return mới vẫn
 * bị bắt, kể cả khi nhánh đó viết cách khác.
 *
 * Chạy: node scripts/check-ai-status.cjs [--self-test]
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ACTION = "aiStatus";

/**
 * Cắt riêng khối mã của một action: `export const <name> = action({...})`.
 * Cân bằng ngoặc nên nhận ra hết thân hàm, không phụ thuộc thứ tự file.
 */
function extractAction(src, name) {
  const start = src.indexOf(`export const ${name} = action(`);
  if (start === -1) return null;
  const open = src.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Mọi object literal mà action `return` về. Cân bằng ngoặc từ `{` ngay sau
 * `return` — nên `return` của nhánh lồng nhau cũng bị thu, không chỉ nhánh đầu.
 */
function returnedObjects(block) {
  const out = [];
  const re = /return\s*\{/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const open = block.indexOf("{", m.index);
    let depth = 0;
    for (let i = open; i < block.length; i++) {
      if (block[i] === "{") depth++;
      else if (block[i] === "}") {
        depth--;
        if (depth === 0) {
          out.push({ text: block.slice(open, i + 1), index: m.index });
          break;
        }
      }
    }
  }
  return out;
}

/** Biểu thức ngay sau `providerCount:` (tới dấu phẩy cùng cấp hoặc hết dòng). */
function providerCountValues(block) {
  const out = [];
  const re = /providerCount\s*:\s*([^,\n}]+)/g;
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1].trim());
  return out;
}

/**
 * Kiểm nguồn `haimiya`. Nhận nội dung qua tham số để `--self-test` nạp bản SAI
 * vào — một luật không chứng minh được nó bắt thì chỉ là trang trí.
 */
function checkSources({ haimiya }) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, ok, detail });

  const block = extractAction(haimiya, ACTION);
  if (!block) {
    add(
      `Tìm thấy action ${ACTION} (nơi trả thông tin chẩn đoán AI)`,
      false,
      "không tìm thấy `export const aiStatus = action(` trong convex/haimiya.ts — thông tin chẩn đoán đã mất",
    );
    return out;
  }
  add(`Tìm thấy action ${ACTION} (nơi trả thông tin chẩn đoán AI)`, true);

  // ── 1. MỌI nhánh return phải có providerCount ──
  const objs = returnedObjects(block);
  const missing = objs.filter((o) => !/providerCount\s*:/.test(o.text));
  add(
    missing.length === 0 && objs.length > 0
      ? `Cả ${objs.length} nhánh return của ${ACTION} đều trả providerCount`
      : `${missing.length}/${objs.length} nhánh return THIẾU providerCount`,
    missing.length === 0 && objs.length > 0,
    missing.length
      ? "thiếu ở nhánh: " + missing.map((o) => o.text.replace(/\s+/g, " ").slice(0, 70)).join(" | ")
      : `tìm thấy ${objs.length} object trả về`,
  );

  // ── 2. Con số phải đếm DANH SÁCH provider, không phải provider đầu ──
  const values = providerCountValues(block);
  const fromList = values.filter((v) => /aiProviders\s*\(\s*\)/.test(v));
  add(
    fromList.length > 0
      ? "providerCount suy ra từ aiProviders() (đếm cả chuỗi, không chỉ provider đầu)"
      : "providerCount KHÔNG suy ra từ aiProviders() — số liệu chẩn đoán sai lệch",
    fromList.length > 0,
    fromList.length
      ? `biểu thức: ${fromList.join(" | ")}`
      : `thấy: ${values.join(" | ") || "(không có)"}`,
  );

  // ── 3. Endpoint public: tuyệt đối không trả khoá API ──
  const leaky = objs.filter((o) => /(^|[\s{,])key\s*:/i.test(o.text));
  add(
    leaky.length === 0
      ? `${ACTION} không trả field key ra endpoint public`
      : `${ACTION} trả field key ra endpoint public — lộ secret`,
    leaky.length === 0,
    leaky.length ? `nhánh: ${leaky[0].text.replace(/\s+/g, " ").slice(0, 70)}` : "",
  );

  return out;
}

/** Tự kiểm: nạp nguồn CỐ TÌNH SAI và chứng minh cổng bắt được. */
function selfTest(real) {
  const results = [];

  // 1. Quên providerCount ở nhánh rate-limit — đúng kịch bản dựng thêm nhánh
  //    return mà không kèm trường chẩn đoán.
  const dropped = real.haimiya.replace(/^\s*providerCount:\s*0,\n/m, "");
  results.push({
    name: "self-test: cổng ĐỎ khi một nhánh return mất providerCount",
    ok: dropped !== real.haimiya && checkSources({ haimiya: dropped }).some((r) => !r.ok),
  });

  // 2. Đếm nhầm thành provider đầu (`p ? 1 : 0`) — số luôn ra 1, đúng kiểu
  //    sai lệch im lặng.
  const firstOnly = real.haimiya.replace(
    /providerCount:\s*aiProviders\(\)\.length,/,
    "providerCount: p ? 1 : 0,",
  );
  results.push({
    name: "self-test: cổng ĐỎ khi providerCount chỉ đếm provider ĐẦU",
    ok: firstOnly !== real.haimiya && checkSources({ haimiya: firstOnly }).some((r) => !r.ok),
  });

  // 3. Số cứng — thông tin chẩn đoán thành vỏ, luôn "đúng" nên không ai thấy.
  const hardcoded = real.haimiya.replace(
    /providerCount:\s*aiProviders\(\)\.length,/,
    "providerCount: 1,",
  );
  results.push({
    name: "self-test: cổng ĐỎ khi providerCount để số cứng",
    ok: hardcoded !== real.haimiya && checkSources({ haimiya: hardcoded }).some((r) => !r.ok),
  });

  // 4. Rò khoá API ra endpoint public.
  const leaky = real.haimiya.replace("configured: !!p,", "configured: !!p,\n      key: p?.key,");
  results.push({
    name: "self-test: cổng ĐỎ khi aiStatus trả field key ra ngoài",
    ok: leaky !== real.haimiya && checkSources({ haimiya: leaky }).some((r) => !r.ok),
  });

  // 5. Xoá hẳn action — thông tin chẩn đoán biến mất hoàn toàn.
  results.push({
    name: "self-test: cổng ĐỎ khi action aiStatus biến mất",
    ok: checkSources({
      haimiya: "export const khac = action({ args: {}, handler: () => null });",
    }).every((r) => !r.ok),
  });

  results.push({
    name: "self-test: cổng XANH trên nguồn thật (không báo động giả)",
    ok: checkSources(real).every((r) => r.ok),
  });
  return results;
}

function print(results) {
  let fail = 0;
  for (const r of results) {
    if (r.ok) console.log(`PASS ${r.name}`);
    else {
      fail++;
      console.error(`FAIL ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  console.log(`\nKết quả: ${results.length - fail} pass, ${fail} fail`);
  return fail;
}

if (require.main === module) {
  const real = {
    haimiya: fs.readFileSync(path.join(ROOT, "convex", "haimiya.ts"), "utf8"),
  };
  const results = process.argv.includes("--self-test")
    ? [...selfTest(real), ...checkSources(real)]
    : checkSources(real);
  process.exit(print(results) ? 1 : 0);
}

module.exports = { checkSources, selfTest, extractAction, returnedObjects };
