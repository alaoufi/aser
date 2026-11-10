import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyStatus } from "@/server/management";
import { familyAccountState } from "@/lib/family-status";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const row = await familyStatus(user);
  return json({
    state: row ? familyAccountState(row, today()) : null,
    // رابط أسرة صاحب الحساب: لإخفاء «مراسلة الأسرة» عن صفحاتها هي.
    slug: row?.slug ?? null,
  });
});
