import { z } from "zod";
import { api, json, readBoundedBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { uploadProductImage } from "@/server/media";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
export const POST = api(async (request, context) => {
  const user = await requireUser(request, ["producer", "admin"]);
  const { id } = await context.params;
  z.uuid().parse(id);
  await rateLimit("product-image:" + user.id, 30, 3600);
  const raw = await readBoundedBody(request, 6 * 1024 * 1024);
  const bounded = new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: raw,
  });
  const form = await bounded.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "اختر صورة المنتج");
  return json(await uploadProductImage(user, id, file));
}, true);
