import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { familyStatus } from "@/server/management";
import { familyAccountState } from "@/lib/family-status";
import { getSiteTexts } from "@/server/settings";
import { siteTextDefaults } from "@/lib/site-texts";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(
    new Date(),
  );
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const row = await familyStatus(user);
  const recent =
    row?.status === "approved" &&
    row.approvedAt &&
    Date.now() - new Date(row.approvedAt).getTime() < MONTH_MS;
  const congrats = recent
    ? (await getSiteTexts().catch(() => null))?.["approval.message"] ||
      siteTextDefaults["approval.message"]
    : undefined;
  return json({
    state: row
      ? {
          ...familyAccountState(row, today()),
          ...(congrats ? { congrats } : {}),
        }
      : null,
    // رابط أسرة صاحب الحساب: لإخفاء «مراسلة الأسرة» عن صفحاتها هي.
    slug: row?.slug ?? null,
  });
});
