import type { Metadata } from "next";
import Image from "next/image";
import { Lines } from "@/components/public/ui";
import { getSiteTexts } from "@/server/settings";
export const metadata: Metadata = { title: "حكايتنا" };
export default async function About() {
  const t = await getSiteTexts();
  return (
    <article className="wrap prose page-space">
      <Image
        className="about-brand-logo"
        src="/brand/jdatna-main.webp"
        alt="شعار جدتنا: الجدة تطبخ، واسم جدتنا، أكل شعبي سعودي"
        width={480}
        height={600}
        sizes="192px"
        loading="eager"
      />
      {t["about.eyebrow"] && <p className="eyebrow">{t["about.eyebrow"]}</p>}
      <h1 className={t["about.title"] ? undefined : "sr-only"}>
        <Lines text={t["about.title"] || "حكايتنا"} />
      </h1>
      {t["about.lead"] && (
        <p className="lead">
          <Lines text={t["about.lead"]} />
        </p>
      )}
      {(["1", "2", "3"] as const).map((n) => (
        <section key={n}>
          {t[`about.h${n}`] && <h2>{t[`about.h${n}`]}</h2>}
          {t[`about.p${n}`] && (
            <p>
              <Lines text={t[`about.p${n}`]} />
            </p>
          )}
        </section>
      ))}
    </article>
  );
}
