import type { Metadata } from "next";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/server/settings";

export const metadata: Metadata = {
  title: "حدّث تطبيق أكلات جدتنا",
  robots: { index: false, follow: false },
};

/**
 * إجبار تحديث التطبيق القديم (طلب المالك 2026-11-25: «إذا فيه تحديث يحوّل للتحديث ولا يقبل يواصل»).
 * النسخ القديمة تفتح jdatna.com/?source=app (أندرويد) و?source=ios (الآيفون)، والجديدة تفتح jdtna.sa،
 * فيحوّل src/proxy.ts فتح التطبيق القديم إلى هنا. لا رابط للمواصلة في الموقع: الزر الوحيد للمتجر.
 */
export default async function UpdateApp({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const ios = (await searchParams).p === "ios";
  return (
    <article className="wrap prose page-space update-app">
      <h1>تحديث جديد للتطبيق</h1>
      <p className="lead">
        صدرت نسخة جديدة من تطبيق أكلات جدتنا. حدّث التطبيق لتكمل، ثم سجّل دخولك
        مرة واحدة.
      </p>
      <div className="dish-actions">
        <a className="button" href={ios ? APP_STORE_URL : PLAY_STORE_URL}>
          {ios ? "حدّث من App Store" : "حدّث من Google Play"}
        </a>
      </div>
    </article>
  );
}
