import { getSiteTexts } from "@/server/settings";
import { UnsubscribeForm } from "@/components/public/unsubscribe-form";
export const metadata = {
  title: "إيقاف تنبيهات الأسرة",
  robots: { index: false },
};
export const dynamic = "force-dynamic";
/** رابط الإلغاء في كل تنبيه: يعمل بلا دخول، وبضغطة تأكيد (لا يُلغى بمجرد فتح الرابط أو معاينته). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const [{ t }, texts] = await Promise.all([searchParams, getSiteTexts()]);
  const token = typeof t === "string" && /^[a-f0-9]{48}$/.test(t) ? t : "";
  return (
    <div className="wrap page-space">
      <h1>{texts["alerts.unsubscribeTitle"]}</h1>
      <UnsubscribeForm
        token={token}
        texts={{
          button: texts["alerts.unsubscribeButton"],
          done: texts["alerts.unsubscribed"],
          invalid: texts["alerts.unsubscribeInvalid"],
        }}
      />
    </div>
  );
}
