import { z } from "zod";
import { api, json } from "@/server/http";
import { getProducer } from "@/server/catalog";
import { shareCode, shortUrl } from "@/server/share";
import { HttpError } from "@/server/security";
/** رابط المشاركة المختصر لمنتج (?product=المعرف) أو أسرة (?family=الرابط)، للصفحات العامة فقط. */
export const GET = api(async (request) => {
  const q = new URL(request.url).searchParams;
  const product = q.get("product"),
    family = q.get("family");
  if (product)
    return json({
      url: shortUrl(await shareCode("product", z.uuid().parse(product))),
    });
  if (family) {
    const p = await getProducer(family.slice(0, 200));
    if (!p) throw new HttpError(404, "الأسرة المنتجة غير متاحة");
    return json({ url: shortUrl(await shareCode("family", p.id)) });
  }
  throw new HttpError(400, "حدد المنتج أو الأسرة");
});
