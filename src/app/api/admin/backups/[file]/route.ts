import { api, json } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { backupDownload, requestBackupDelete } from "@/server/backups";
type Context = { params: Promise<{ file: string }> };
/** تحميل نسخة احتياطية مشفّرة: لمدير المنصة فقط، بحد 10 تحميلات في الساعة. */
export const GET = api(async (request, context: Context) => {
  const user = await requireUser(request);
  const { file } = await context.params;
  if (user.role === "admin")
    await rateLimit("backup-download:" + user.id, 10, 3600);
  const { size, stream } = await backupDownload(user, file);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      ...(size ? { "Content-Length": String(size) } : {}),
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
/** «حذف» النسخة: طلب ينفّذه الخادم خلال دقيقة (من الخادم والتخزين الخارجي). بحد 20 في الساعة. */
export const DELETE = api(async (request, context: Context) => {
  const user = await requireUser(request);
  const { file } = await context.params;
  if (user.role === "admin")
    await rateLimit("backup-delete:" + user.id, 20, 3600);
  return json(await requestBackupDelete(user, { file }));
}, true);
