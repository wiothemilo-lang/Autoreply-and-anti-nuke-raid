/**
 * commentScan.cjs — bóc comment khỏi nguồn mà KHÔNG nuốt code phía sau URL.
 *
 * Vì sao có file này: 3 cổng tĩnh (`check-settings-signal`, `check-cron-boundary`,
 * `check-bot-payload`) từng dùng regex `//[^\n]*`. Trong repo có rất nhiều URL
 * (`https://…`) nằm trong chuỗi, nên regex đó xoá luôn phần còn lại của DÒNG —
 * một mutation/field thật đứng sau URL trên cùng dòng sẽ bị bỏ sót, cổng báo
 * SẠCH sai. `check-timer-allowlist` đã tự viết máy trạng thái đúng từ trước;
 * file này gom nó về một chỗ để cả 4 cổng dùng chung.
 *
 * Hàm thay comment bằng khoảng trắng, GIỮ NGUYÊN độ dài và số dòng — nhờ vậy
 * mọi index/offset tính trên nguồn gốc vẫn đúng.
 */
function blankComments(src) {
  const out = src.split("");
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      let j = i;
      while (j < src.length && src[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    i++;
  }
  return out.join("");
}

module.exports = { blankComments };
