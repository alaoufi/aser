import { api } from "@/server/http";
import { adminArea, adminCookie, logout, sessionCookie } from "@/server/auth";
/**
 * من «لوحة الإدارة»: يُغلق جلسة الإدارة وحدها ويعود العضو لحسابه الشخصي.
 * ومن الموقع: يُغلق الجلسة الشخصية وجلسة الإدارة في هذا الجهاز معًا.
 */
export const POST = api(async (request) => {
  const fromAdmin = adminArea(request);
  await logout(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", adminCookie("", 0));
  if (!fromAdmin) headers.append("Set-Cookie", sessionCookie("", 0));
  return Response.json({ ok: true }, { headers });
}, true);
