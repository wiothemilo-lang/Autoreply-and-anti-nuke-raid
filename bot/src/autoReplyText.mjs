const AUTO_REPLY_LIMIT = 1900;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function truncateAutoReply(text) {
  if (text.length <= AUTO_REPLY_LIMIT) return text;
  // Cụm chứa ký tự đầu tiên ngoài giới hạn có thể bắt đầu trước giới hạn.
  const { index } = graphemes.segment(text).containing(AUTO_REPLY_LIMIT);
  return text.slice(0, index) + "…";
}
