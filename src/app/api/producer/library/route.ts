import { api, json, jsonBody, readBoundedBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  addLibraryPhoto,
  deleteLibraryPhoto,
  listLibrary,
  updateLibraryPhoto,
} from "@/server/library";
import { HttpError } from "@/server/security";
export const runtime = "nodejs";
export const GET = api(async (request) =>
  json({ photos: await listLibrary(await requireUser(request)) }),
);
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("library-upload:" + user.id, 60, 3600);
  const raw = await readBoundedBody(request, 6 * 1024 * 1024);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: raw,
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size)
    throw new HttpError(400, "اختر صورة الطبق");
  return json(
    await addLibraryPhoto(user, file, {
      name: form.get("name"),
      description: form.get("description") ?? "",
      categoryId: form.get("categoryId") || null,
    }),
    201,
  );
}, true);
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("library-write:" + user.id, 120, 3600);
  return json(await updateLibraryPhoto(user, await jsonBody(request)));
}, true);
export const DELETE = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("library-write:" + user.id, 120, 3600);
  return json(await deleteLibraryPhoto(user, await jsonBody(request)));
}, true);
