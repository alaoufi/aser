import { api, json, readBoundedBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { uploadDocument } from "@/server/storage";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("upload:" + user.id, 10, 3600);
  const length = Number(request.headers.get("content-length"));
  if (length > 11 * 1024 * 1024)
    throw new HttpError(413, "يلزم ملف بحد أقصى 10 ميجابايت");
  const body = await readBoundedBody(request, 11 * 1024 * 1024);
  const bounded = new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body,
  });
  const form = await bounded.formData();
  const file = form.get("file"),
    type = form.get("type");
  if (!(file instanceof File) || typeof type !== "string")
    throw new HttpError(400, "الملف ونوع المستند مطلوبان");
  return json(await uploadDocument(user.id, file, type));
}, true);
