import { cookies, headers } from "next/headers";
import { sessionUser } from "./auth";
import { getCategories, getCities } from "./catalog";
import { memberScope, parseMine, type MemberScope } from "./member-scope";
import { getInterests } from "./member-interests";
import { regionsOf } from "@/components/public/today-table";

export type MineChoices = {
  regions?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  chosen?: string[];
};

/**
 * فلاتر العضو لصفحة تُبنى في الخادم: يقرأ جلسة الموقع من ترويسات الطلب نفسه، والمفاتيح المفعّلة من
 * الرابط (?mine=…)، ومنطقة الجهاز المحفوظة للعميل. الزائر بلا حساب: لا فلاتر.
 * وحين يحتاج خيار شيئًا ليعمل (منطقة، أو ما يحب من الأكلات) تُرفق قائمته ليختار منها في اللوحة.
 */
export async function pageMemberScope(
  mine: string | string[] | undefined,
): Promise<MemberScope & { choices: MineChoices }> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const user = await sessionUser(
    new Request("http://local/", { headers: new Headers(h) }),
  ).catch(() => null);
  const scope = await memberScope(
    user,
    parseMine(mine),
    jar.get("jdatna_region")?.value ?? "",
  );
  const choices: MineChoices = {};
  if (scope.needs === "region") choices.regions = regionsOf(await getCities());
  if (scope.needs === "interests" && user) {
    const [all, chosen] = await Promise.all([
      // قائمة الأقسام كلها (الظاهرة)، لا ما عليه منتجات اليوم فقط.
      getCategories(),
      getInterests(user),
    ]);
    choices.categories = all
      .filter((c) => !c.parentId)
      .map((c) => ({ id: c.id, name: c.name }));
    choices.chosen = chosen;
  }
  return { ...scope, choices };
}
