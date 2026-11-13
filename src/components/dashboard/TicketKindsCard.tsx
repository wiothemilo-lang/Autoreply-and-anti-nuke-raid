import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { toastConvexError } from "../../lib/toastError";
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { GuildData } from "../../lib/types";
import { getSessionToken } from "../../lib/discord";
import { translate } from "../../lib/i18n";

const TOKEN = () => getSessionToken();

/** 1 loại ticket tuỳ chỉnh (đã chuẩn hoá phía Convex). */
type Kind = {
  key: string;
  label: string;
  description: string | null;
  emoji: string | null;
  color: string | null;
  question: string | null;
  questionPlaceholder: string | null;
  evidenceQuestion: string | null;
  staffRoleIds: string[];
  /** Ô nhập bổ sung (phương án B) — tối đa 3 ô, khớp MAX_EXTRA_FIELDS bên Convex. */
  fields: {
    key: string;
    label: string;
    placeholder?: string;
    required?: boolean;
    long?: boolean;
  }[];
  order: number;
  enabled: boolean;
};

/**
 * 1 ô nhập bổ sung của riêng loại này.
 *
 * `key` ĐI THẲNG vào customId nên không đổi sau khi tạo — nhưng nó cũng là
 * thứ duy nhất phải khoá lại trong UI, vì ticket đã mổ vẫn tra theo khoá này.
 */
type ExtraField = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  long: boolean;
};

/** Khớp MAX_EXTRA_FIELDS ở convex/ticketKinds.ts. */
const MAX_EXTRA_FIELDS = 3;

type FormState = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  question: string;
  questionPlaceholder: string;
  evidenceQuestion: string;
  staffRoleIds: string[];
  extraFields: ExtraField[];
};

const emptyForm: FormState = {
  key: "",
  label: "",
  description: "",
  emoji: "",
  question: "",
  questionPlaceholder: "",
  evidenceQuestion: "",
  staffRoleIds: [],
  extraFields: [],
};

/**
 * Quản lý DANH SÁCH LOẠI TICKET (29/09/2026).
 *
 * Trước đây bot có đúng 2 loại cứng `support` | `appeal` nằm thẳng trong
 * `bot/src/ticketCore.js:normalizeKind` — chủ server muốn thêm nút thì phải sửa
 * code bot. Nay mỗi loại là 1 dòng dữ liệu: nhãn, emoji, câu hỏi riêng trong
 * modal, role xử lý riêng, thứ tự và bật/tắt.
 *
 * ⚠️ Xoá hết loại KHÔNG phải "tắt tính năng": server không còn dòng nào thì bot
 * rơi về đúng 2 loại cứng cũ (support + khiếu nại). Muốn ẩn hẳn thì tắt
 * công tắc, không xoá.
 */
export default function TicketKindsCard({
  data,
  onKindsLoaded,
}: {
  data: GuildData;
  /**
   * Báo nhãn loại lên panel cha để danh sách ticket hiện đúng tên thay vì
   * mã khoá. Gọi trong effect + nằm sau error boundary: nếu card này lỗi
   * (backend chưa deploy hàm mới) thì panel cha rơi về hiện mã khoá — vẫn
   * đọc được, không mất danh sách ticket.
   */
  onKindsLoaded?: (kinds: Kind[]) => void;
}) {
  const g = data.guild;
  const saveKind = useMutation(api.ticketKinds.saveKind);
  const removeKind = useMutation(api.ticketKinds.removeKind);
  const setKindEnabled = useMutation(api.ticketKinds.setKindEnabled);
  const swapKindOrder = useMutation(api.ticketKinds.swapKindOrder);
  const kinds = useQuery(api.ticketKinds.listKinds, {
    token: TOKEN(),
    guildId: g.discordId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Kind | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const list = kinds ?? [];

  useEffect(() => {
    onKindsLoaded?.(list);
  }, [list, onKindsLoaded]);
  const roles = data.roles;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(k: Kind) {
    setEditing(k);
    setForm({
      key: k.key,
      label: k.label,
      description: k.description ?? "",
      emoji: k.emoji ?? "",
      question: k.question ?? "",
      questionPlaceholder: k.questionPlaceholder ?? "",
      evidenceQuestion: k.evidenceQuestion ?? "",
      staffRoleIds: k.staffRoleIds,
      extraFields: (k.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        placeholder: f.placeholder ?? "",
        required: f.required === true,
        long: f.long === true,
      })),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!/^[a-z0-9_-]{1,32}$/.test(form.key.trim())) {
      return toast.error(translate("Mã loại chỉ gồm chữ thường, số, _ hoặc - (tối đa 32 ký tự)."));
    }
    if (!form.label.trim()) return toast.error(translate("Cần có tên hiển thị trên nút."));
    setSaving(true);
    try {
      await saveKind({
        token: TOKEN(),
        guildId: g.discordId,
        key: form.key.trim().toLowerCase(),
        label: form.label.trim(),
        description: form.description.trim(),
        emoji: form.emoji.trim(),
        question: form.question.trim(),
        questionPlaceholder: form.questionPlaceholder.trim(),
        evidenceQuestion: form.evidenceQuestion.trim(),
        staffRoleIds: form.staffRoleIds,
        fields: form.extraFields.map((f) => ({
          key: f.key.trim().toLowerCase(),
          label: f.label.trim(),
          placeholder: f.placeholder.trim(),
          required: f.required,
          long: f.long,
        })),
      });
      toast.success(
        editing
          ? translate('Đã cập nhật loại ticket "{p0}"', { p0: form.label })
          : translate('Đã thêm loại ticket "{p0}"', { p0: form.label }),
      );
      setDialogOpen(false);
    } catch (e) {
      toastConvexError(e, translate("Lưu thất bại"));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(k: Kind, enabled: boolean): Promise<boolean> {
    try {
      await setKindEnabled({ token: TOKEN(), guildId: g.discordId, key: k.key, enabled });
      return true;
    } catch (e) {
      toastConvexError(e, translate("Lưu thất bại"));
      return false;
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const other = list[index + dir];
    if (!other) return;
    try {
      await swapKindOrder({
        token: TOKEN(),
        guildId: g.discordId,
        keyA: list[index].key,
        keyB: other.key,
      });
    } catch (e) {
      toastConvexError(e, translate("Lưu thất bại"));
    }
  }

  async function handleDelete(k: Kind) {
    try {
      await removeKind({ token: TOKEN(), guildId: g.discordId, key: k.key });
      toast.success(translate('Đã xoá loại ticket "{p0}"', { p0: k.label }));
    } catch (e) {
      toastConvexError(e, translate("Lưu thất bại"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{translate("Loại ticket")}</CardTitle>
          <CardDescription>
            {translate(
              "Mỗi loại là 1 nút trên panel, 1 câu hỏi riêng trong modal và có thể có role xử lý riêng. Xoá hết thì bot quay về 2 loại mặc định.",
            )}
          </CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {translate("Thêm loại")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate(
              "Chưa có loại tuỳ chỉnh — bot đang dùng 2 loại mặc định: Hỗ trợ chung và Khiếu nại hình phạt.",
            )}
          </p>
        ) : (
          <ul className="grid gap-2">
            {list.map((k, i) => {
              // `k.label` là nhãn do CHỦ SERVER tự đặt — dữ liệu người dùng,
              // không phải chuỗi giao diện nên KHÔNG bọc translate(). Gán vào
              // biến cục bộ để không bị cổng i18n coi là nhãn giao diện chưa dịch.
              const kindLabel = k.label;
              return (
                <li
                  key={k.key}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="text-lg" aria-hidden>
                    {k.emoji || "•"}
                  </span>
                  <span className="font-medium">{kindLabel}</span>
                  <Badge variant="outline">{k.key}</Badge>
                  {k.staffRoleIds.length > 0 ? (
                    <Badge variant="secondary">
                      {translate("{p0} role riêng", {
                        p0: k.staffRoleIds.length,
                      })}
                    </Badge>
                  ) : null}
                  <span className="flex-1" />
                  <Switch
                    checked={k.enabled}
                    onCheckedChange={(v) => toggle(k, v)}
                    aria-label={translate("Bật loại ticket này")}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={translate("Đưa lên trên")}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    aria-label={translate("Đưa xuống dưới")}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(k)}
                    aria-label={translate("Sửa loại ticket này")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(k)}
                    aria-label={translate("Xoá loại ticket này")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          {translate(
            "Đổi danh sách xong bấm “Gửi lại panel mở ticket” để thay nút trên kênh công khai. Tối đa 10 loại.",
          )}
        </p>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? translate('Chỉnh sửa loại "{p0}"', { p0: editing.label })
                : translate("Thêm loại ticket")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kind-key">{translate("Mã loại (tiếng Anh, không dấu)")}</Label>
              <Input
                id="kind-key"
                placeholder="billing"
                value={form.key}
                disabled={Boolean(editing)}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {translate(
                  "Mã nằm trong nút nên không đổi sau khi tạo. Ticket đã mở vẫn tra được loại này.",
                )}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-label">{translate("Tên trên nút")}</Label>
              <Input
                id="kind-label"
                placeholder={translate("Hoá đơn & thanh toán")}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-emoji">{translate("Emoji (tuỳ chọn)")}</Label>
              <Input
                id="kind-emoji"
                placeholder="💳"
                value={form.emoji}
                onChange={(e) => setForm({ ...form, emoji: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-desc">{translate("Mô tả ngắn (tuỳ chọn)")}</Label>
              <Input
                id="kind-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-question">{translate("Câu hỏi trong modal")}</Label>
              <Input
                id="kind-question"
                placeholder={translate("Bạn cần hỏi gì về hoá đơn?")}
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {translate("Bỏ trống thì dùng câu hỏi mặc định. Tối đa 45 ký tự.")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-placeholder">{translate("Gợi ý trong ô nhập (tuỳ chọn)")}</Label>
              <Input
                id="kind-placeholder"
                value={form.questionPlaceholder}
                onChange={(e) => setForm({ ...form, questionPlaceholder: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kind-evidence">{translate("Câu hỏi ô bằng chứng (tuỳ chọn)")}</Label>
              <Input
                id="kind-evidence"
                value={form.evidenceQuestion}
                onChange={(e) => setForm({ ...form, evidenceQuestion: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{translate("Ô nhập bổ sung (tối đa 3)")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={form.extraFields.length >= MAX_EXTRA_FIELDS}
                  onClick={() =>
                    setForm({
                      ...form,
                      extraFields: [
                        ...form.extraFields,
                        { key: "", label: "", placeholder: "", required: false, long: false },
                      ],
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  {translate("Thêm ô")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {translate(
                  "Mỗi ô là 1 câu hỏi thêm trong modal mở ticket. 2 ô nội dung và bằng chứng đã có sẵn nên chỉ thêm được 3 ô nữa.",
                )}
              </p>
              {form.extraFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">{translate("Chưa thêm ô nào.")}</p>
              ) : (
                form.extraFields.map((f, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor={`xf-label-${i}`}>{translate("Tiêu đề ô")}</Label>
                        <Input
                          id={`xf-label-${i}`}
                          value={f.label}
                          onChange={(e) => {
                            const next = [...form.extraFields];
                            next[i] = { ...f, label: e.target.value };
                            setForm({ ...form, extraFields: next });
                          }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`xf-key-${i}`}>
                          {translate("Mã ô (tiếng Anh, không dấu)")}
                        </Label>
                        <Input
                          id={`xf-key-${i}`}
                          placeholder="amount"
                          value={f.key}
                          onChange={(e) => {
                            const next = [...form.extraFields];
                            next[i] = { ...f, key: e.target.value };
                            setForm({ ...form, extraFields: next });
                          }}
                        />
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`xf-ph-${i}`}>
                        {translate("Gợi ý trong ô nhập (tuỳ chọn)")}
                      </Label>
                      <Input
                        id={`xf-ph-${i}`}
                        value={f.placeholder}
                        onChange={(e) => {
                          const next = [...form.extraFields];
                          next[i] = { ...f, placeholder: e.target.value };
                          setForm({ ...form, extraFields: next });
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => {
                            const next = [...form.extraFields];
                            next[i] = { ...f, required: e.target.checked };
                            setForm({ ...form, extraFields: next });
                          }}
                        />
                        {translate("Bắt buộc nhập")}
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={f.long}
                          onChange={(e) => {
                            const next = [...form.extraFields];
                            next[i] = { ...f, long: e.target.checked };
                            setForm({ ...form, extraFields: next });
                          }}
                        />
                        {translate("Ô nhiều dòng")}
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm({
                            ...form,
                            extraFields: form.extraFields.filter((_, x) => x !== i),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        {translate("Xoá ô này")}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-2">
              <Label>{translate("Role xử lý riêng cho loại này")}</Label>
              <p className="text-xs text-muted-foreground">
                {translate("Bỏ trống thì dùng role xử lý ticket chung đã cấu hình ở trên.")}
              </p>
              <div className="flex flex-wrap gap-2">
                {roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {translate("Chưa có role nào trong server.")}
                  </p>
                ) : (
                  roles.slice(0, 40).map((r) => {
                    const picked = form.staffRoleIds.includes(r.roleId);
                    return (
                      <Button
                        key={r.roleId}
                        type="button"
                        size="sm"
                        variant={picked ? "default" : "outline"}
                        onClick={() =>
                          setForm({
                            ...form,
                            staffRoleIds: picked
                              ? form.staffRoleIds.filter((x) => x !== r.roleId)
                              : [...form.staffRoleIds, r.roleId].slice(0, 5),
                          })
                        }
                      >
                        {r.name}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              className="transition-colors duration-150"
            >
              {translate("Hủy")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 transition-all duration-150"
            >
              <ListPlus className="h-4 w-4" />
              {translate(saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm loại")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
