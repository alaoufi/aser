import { cookies, headers } from "next/headers";
import { sessionUser } from "./auth";
import { memberScope, parseMine, type MemberScope } from "./member-scope";

/**
 * فلاتر العضو لصفحة تُبنى في الخادم: يقرأ جلسة الموقع من ترويسات الطلب نفسه، والمفاتيح المفعّلة من
 * الرابط (?mine=…)، ومنطقة الجهاز المحفوظة للعميل. الزائر بلا حساب: لا فلاتر.
 */
export async function pageMemberScope(
  mine: string | string[] | undefined,
): Promise<MemberScope> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const user = await sessionUser(
    new Request("http://local/", { headers: new Headers(h) }),
  ).catch(() => null);
  return memberScope(
    user,
    parseMine(mine),
    jar.get("jdatna_region")?.value ?? "",
  );
}
