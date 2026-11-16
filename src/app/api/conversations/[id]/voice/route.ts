import { api, json, readBoundedBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { sendVoice, VOICE_MAX_BYTES } from "@/server/chat";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
/** إرسال رسالة صوتية: الملف في حقل file، ومدته بالميلي ثانية في duration. */
export const POST = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("chat-send:" + user.id, 120, 3600);
  await rateLimit("chat-voice:" + user.id, 40, 3600);
  const limit = VOICE_MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new HttpError(413, "التسجيل أكبر من المسموح");
  const body = await readBoundedBody(request, limit);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body,
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "التسجيل مطلوب");
  return json(
    await sendVoice(
      user,
      (await context.params).id,
      new Uint8Array(await file.arrayBuffer()),
      form.get("duration"),
    ),
    201,
  );
}, true);
