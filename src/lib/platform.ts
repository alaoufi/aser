/** نوع الجوال من المتصفح: الآيفون، أو أندرويد، أو غيرهما (كمبيوتر). */
export function platformOf(ua: string): "ios" | "android" | "web" {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}
