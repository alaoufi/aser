import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CertificateArt,
  certificateStyles as s,
} from "@/components/certificate/certificate";
import { PrintButton } from "@/components/certificate/print-button";
import { ShareButton } from "@/components/public/share-button";
import { getCertificate } from "@/server/certificates";
import { getSiteTexts } from "@/server/settings";
import { siteTextDefaults } from "@/lib/site-texts";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const c = await getCertificate((await params).id);
  return {
    title: c ? `شهادة أسرة مميزة: ${c.familyName}` : "الشهادة غير موجودة",
    robots: { index: false },
  };
}
export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const c = await getCertificate((await params).id);
  if (!c) notFound();
  const t = await getSiteTexts();
  const text = (
    k: "certificate.title" | "certificate.body" | "certificate.badge",
  ) => t[k] || siteTextDefaults[k];
  return (
    <div className="wrap page-space">
      <CertificateArt
        familyName={c.familyName}
        issuedAt={c.issuedAt}
        title={text("certificate.title")}
        body={text("certificate.body")}
        badge={text("certificate.badge")}
      />
      <div className={s.actions}>
        <PrintButton label="تحميل الشهادة PDF أو طباعتها" />
        <ShareButton title={`شهادة أسرة مميزة: ${c.familyName}`} />
        {c.producerSlug && (
          <Link
            className="button secondary"
            href={`/producers/${c.producerSlug}`}
          >
            صفحة الأسرة
          </Link>
        )}
      </div>
    </div>
  );
}
