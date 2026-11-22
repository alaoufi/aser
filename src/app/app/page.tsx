import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "حمّل تطبيق أكلات جدتنا",
  description:
    "حمّل تطبيق أكلات جدتنا على الآيفون من App Store أو على أندرويد من Google Play.",
  alternates: { canonical: "/app" },
};

/**
 * رابط مختصر واحد للتطبيق: jdatna.com/app يفتح المتجر المناسب لجوال الزائر
 * (Google Play لأندرويد، App Store للآيفون والآيباد)، وفي الكمبيوتر صفحة فيها الرابطان.
 */
export default async function AppLink() {
  const agent = (await headers()).get("user-agent") ?? "";
  if (/android/i.test(agent)) redirect(PLAY_STORE_URL);
  if (/iphone|ipad|ipod/i.test(agent)) redirect(APP_STORE_URL);
  return (
    <article className="wrap prose page-space app-links">
      <h1>حمّل تطبيق أكلات جدتنا</h1>
      <p className="lead">
        اختر متجر جوالك. وفي الجوال يفتح هذا الرابط متجره مباشرة.
      </p>
      <div className="dish-actions">
        <a className="button" href={APP_STORE_URL}>
          الآيفون: App Store
        </a>
        <a className="button secondary" href={PLAY_STORE_URL}>
          أندرويد: Google Play
        </a>
      </div>
      <p>
        روابط مختصرة للمشاركة: <bdi dir="ltr">jdtna.sa/app</bdi> لكل الأجهزة، و
        <bdi dir="ltr">jdtna.sa/ios</bdi> للآيفون، و
        <bdi dir="ltr">jdtna.sa/gl</bdi> لأندرويد.
      </p>
    </article>
  );
}
