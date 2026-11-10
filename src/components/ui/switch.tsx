import * as React from "react";

import { cn } from "../../lib/utils";
import { translate } from "../../lib/i18n";
import { ModernToggle } from "../../shaders/skeuomorphic-toggle/ModernToggle";
import "./switch.css";

/**
 * Switch — bật/tắt, dựng lại trên `ModernToggle` của ThreeUI: track hairline,
 * núm co giãn theo hướng đi, dấu check↔dash, một vũng sáng mềm.
 *
 * Vì sao import THẲNG `ModernToggle` chứ không qua `SkeuomorphicToggleCollection`:
 * collection là cửa ngõ của cả 4 variant, nên chỉ một import ở đây khiến Rollup
 * dựng luôn chunk glass/shader/packaged — kéo `three` (~115 KB gzip) và
 * `NeuformBatchEffects` (~68 KB gzip) vào artifact dù KHÔNG đường render nào
 * chạm tới. App chỉ dùng variant "modern", nên đi thẳng vào file đó. Cây
 * `src/shaders/**` vẫn nguyên vẹn cho `scripts/_resolve-shaders.cjs`.
 *
 * Giữ NGUYÊN tên export và hợp đồng cũ (`checked`, `onCheckedChange`,
 * `disabled`, `id`, `aria-label`, `className`) nên 34 chỗ dùng trong các
 * panel không phải sửa dòng nào.
 *
 * Ba chỗ component gốc không khớp hợp đồng đó — xử lý ở đây, không sửa một
 * byte nào trong `src/shaders/**` (file nguồn phải giữ đúng SHA-256):
 *
 *  1. KHÔNG CONTROLLED. `ModernToggle` chỉ có `defaultOn` +
 *     `onChange`; state nằm trong chính nó. Trong dashboard state nằm ở
 *     Convex nên phải điều khiển từ ngoài. Nối bằng cách CHỈ remount khi giá
 *     trị đổi từ bên ngoài (mốc `emitted` bên dưới).
 *
 *     Đây là chỗ dễ làm mất animation nhất: nếu remount mỗi lần bấm thì
 *     `ModernToggle` sinh ra với `defaultOn` đã đúng ngay từ đầu, effect
 *     spring thấy value == target và KHÔNG chạy — mất sạch cú động nở của núm.
 *
 *  2. KHÔNG CÓ `disabled`. Khoá ở cả ba lớp: `pointer-events` trong CSS,
 *     chặn `onChange` ở đây, và `button.disabled` thật trong effect để focus
 *     không nhảy vào nút đang khoá.
 *
 *  3. KHÔNG CÓ `id`. Component tự render `<button>` riêng, không forward ref.
 *     Một chỗ dùng `<Label htmlFor="test-mention">` nên phải gắn id vào nút
 *     bên trong bằng effect.
 */
export type SwitchProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "onChange" | "defaultValue"
> & {
  checked: boolean;
  /**
   * Trả `false` (hoặc Promise resolve `false`) = lưu THẤT BẠI → tự trả công tắc
   * về giá trị thật. Trước đây chỉ bắt Promise reject, nên handler `catch` rồi
   * `toast.error` (resolve undefined) làm núm kẹt sai vĩnh viễn.
   */
  onCheckedChange: (checked: boolean) => void | boolean | Promise<unknown>;
  disabled?: boolean;
  /** Gắn vào nút bên trong để `<Label htmlFor>` còn trỏ đúng. */
  id?: string;
  /** Nhãn truy cập. Hàng cấu hình đã có nhãn nhìn thấy được nên thường bỏ trống. */
  label?: string;
};

const Switch = React.forwardRef<HTMLSpanElement, SwitchProps>(
  (
    { checked, onCheckedChange, disabled, id, label, className, "aria-label": ariaLabel, ...rest },
    forwardedRef,
  ) => {
    const rootRef = React.useRef<HTMLSpanElement | null>(null);

    const setRoot = React.useCallback(
      (node: HTMLSpanElement | null) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    /* Giá trị chính ta vừa phát ra từ click. Giữ nó để phân biệt "vừa bấm"
       với "server vừa đẩy giá trị mới về" — chỉ trường hợp sau mới remount. */
    const emitted = React.useRef(checked);
    const [revision, setRevision] = React.useState(0);

    /* `checked` mới nhất — callback bất đồng bộ (revert khi mutation lỗi) cần
       đọc nó mà không phải đưa `checked` vào deps của handleChange. */
    const checkedRef = React.useRef(checked);
    checkedRef.current = checked;

    React.useEffect(() => {
      if (emitted.current === checked) return;
      emitted.current = checked;
      setRevision((value) => value + 1);
    }, [checked]);

    /* id + disabled lên nút bên trong. Chạy lại khi `id`/`disabled` đổi và
       sau mỗi lần remount (nút mới không còn id cũ). */
    React.useEffect(() => {
      const button = rootRef.current?.querySelector<HTMLButtonElement>(".modern-toggle__switch");
      if (!button) return;
      if (id) button.id = id;
      else button.removeAttribute("id");
      button.disabled = Boolean(disabled);
    }, [id, disabled, revision]);

    /* Trả công tắc về ĐÚNG giá trị thật từ prop. Bắt buộc sau khi lưu thất
       bại: effect [checked] KHÔNG chạy khi prop không đổi, nên không remount
       là núm ModernToggle kẹt sai vị trí vĩnh viễn. */
    const syncFromProp = React.useCallback(() => {
      emitted.current = checkedRef.current;
      setRevision((value) => value + 1);
    }, []);

    const handleChange = React.useCallback(
      (next: boolean) => {
        if (disabled) return;
        /* Đánh dấu TRƯỚC khi gọi lên trên: `ModernToggle` đã tự áp dụng giá
           trị rồi, nên lần effect sau phải thấy khớp và im lặng. */
        emitted.current = next;
        let result: unknown;
        try {
          result = onCheckedChange(next);
        } catch {
          // Handler ném đồng bộ → giá trị mới chưa lưu được.
          syncFromProp();
          return;
        }
        // Handler bất đồng bộ (mutation của dashboard): reject HOẶC resolve
        // `false` = lưu thất bại. Dashboard vẫn đang hiển thị giá trị cũ
        // (subscription Convex chưa đổi) → remount về giá trị thật thay vì để
        // công tắc nói dối. `catch` của caller thường chỉ toast rồi resolve
        // undefined — đó chính là đường làm núm kẹt sai trước đây.
        if (result === false) {
          syncFromProp();
          return;
        }
        if (result && typeof (result as PromiseLike<unknown>).then === "function") {
          Promise.resolve(result).then((ok) => {
            if (ok === false) syncFromProp();
          }, syncFromProp);
        }
      },
      [disabled, onCheckedChange, syncFromProp],
    );

    return (
      <span
        ref={setRoot}
        aria-disabled={disabled || undefined}
        className={cn("threeui-switch", disabled && "threeui-switch--disabled", className)}
        {...rest}
      >
        <ModernToggle
          key={revision}
          mode="auto"
          size={1}
          opacity={1}
          hue={0}
          saturation={1}
          brightness={1}
          defaultOn={checked}
          label={label ?? ariaLabel ?? translate("Bật")}
          onChange={handleChange}
        />
      </span>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
