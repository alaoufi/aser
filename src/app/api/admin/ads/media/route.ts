import { api, json, readBoundedBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { uploadAdMedia } from "@/server/ads";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
/** رفع صورة الإعلان (تُعاد للإطار 1200×400) أو مقطعه (حتى 15 م.ب). */
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("ad-media:" + user.id, 60, 3600);
  const raw = await readBoundedBody(request, 16 * 1024 * 1024);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: raw,
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "اختر صورة أو مقطعًا");
  return json(await uploadAdMedia(user, file));
}, true);
