import type { Metadata } from "next";
import { GuideBook } from "@/components/public/guide-book";
import { openGraph } from "@/lib/seo";
import { SITE_VERSION } from "@/lib/version";

export const metadata: Metadata = {
  title: "دليل المستخدم",
  description:
    "دليل أكلات جدتنا خطوة بخطوة: الحساب، والطلب، والمحادثات والرسائل الصوتية، والحظر، والاشتراكات، ولوحة الأسرة المنتجة، والمندوبين.",
  alternates: { canonical: "/guide" },
  openGraph: openGraph({ title: "دليل المستخدم — أكلات جدتنا", url: "/guide" }),
};

/** دليل المستخدم: كتاب ثلاثي الأبعاد بفهرس في أوله، ونص متصل للطباعة. */
export default function Guide() {
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">خطوة بخطوة</p>
        <h1>دليل المستخدم</h1>
        <p>قلّب الصفحات كالكتاب، أو اختر من الفهرس الفصل الذي تحتاجه.</p>
      </div>
      <GuideBook version={SITE_VERSION} />
    </div>
  );
}
