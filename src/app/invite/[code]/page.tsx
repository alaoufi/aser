import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteLanding } from "@/components/public/invite-landing";
import { platformOf } from "@/lib/platform";
import { invitePattern, validInvite } from "@/server/referrals";
import { APP_STORE_URL, PLAY_STORE_URL, getAppLinks } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "دعوة إلى أكلات جدتنا",
  robots: { index: false, follow: false },
};

/**
 * صفحة الدعوة القصيرة (قرار المالك 2026-11-27): «دعاك صديقك، رقم الدعوة …» مع زر نسخ الرقم،
 * ثم تحويل تلقائي حسب الجوال: الآيفون إلى App Store، وأندرويد إلى Google Play، والكمبيوتر إلى التسجيل.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = (await params).code.trim();
  if (
    !invitePattern.test(code) ||
    !(await validInvite(code).catch(() => false))
  )
    redirect("/");
  const [h, links] = await Promise.all([headers(), getAppLinks()]);
  const platform = platformOf(h.get("user-agent") ?? "");
  const store =
    platform === "ios" && links.showAppStore
      ? APP_STORE_URL
      : platform === "android" && links.showPlayStore
        ? PLAY_STORE_URL
        : null;
  return <InviteLanding code={code} platform={platform} store={store} />;
}
