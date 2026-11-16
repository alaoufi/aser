/**
 * ردّ ملف صوتي/وسائط مع دعم Range (سفاري على الآيفون لا يشغّل الصوت بدونه):
 * 206 لجزء صحيح، و416 لجزء خارج الملف، و200 للملف كاملًا.
 */
export function byteRangeResponse(
  data: Uint8Array,
  headers: Record<string, string>,
  rangeHeader: string | null,
) {
  const base = { ...headers, "Accept-Ranges": "bytes" };
  const size = data.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? "");
  if (!range || (!range[1] && !range[2]))
    return new Response(new Uint8Array(data), {
      headers: { ...base, "Content-Length": String(size) },
    });
  const start = range[1]
    ? Number(range[1])
    : Math.max(0, size - Number(range[2]));
  const end =
    range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size)
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${size}` },
    });
  return new Response(new Uint8Array(data.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...base,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
