import Image from "next/image";
import Link from "next/link";
import type { Producer } from "@/lib/types";
import type { SiteTexts } from "@/lib/site-texts";
import { RegionPicker } from "@/components/public/region-picker";
import { ProducerCard } from "@/components/public/ui";

/**
 * الرئيسية في القالب المبسّط (طلب المالك 2026-11-26): عنوان كبير، وبطاقة بحث بسطرين
 * («أحب أكلات» و«في» المنطقة)، وبطاقتا التوفر، وقوس بطبق واحد، وسطر ثقة، ثم أسر حقيقية قريبة.
 * بلا الطاولة الخشبية وبلا الشارة العائمة. كل النصوص من «نصوص الموقع».
 */
export function SimpleHome({
  texts,
  regions,
  region,
  producers,
}: {
  texts: SiteTexts;
  regions: { id: string; name: string }[];
  region: string;
  producers: Producer[];
}) {
  const t = (k: keyof SiteTexts) => texts[k];
  return (
    <>
      <section className="simple-hero wrap" aria-labelledby="simple-title">
        <div className="simple-hero-copy">
          <h1 id="simple-title" className="simple-title">
            {t("simple.title")}
          </h1>
          {t("simple.lead") && (
            <p className="simple-lead">
              {t("simple.lead").replace("{regions}", String(regions.length))}
            </p>
          )}
          <form action="/browse" className="simple-search" autoComplete="off">
            <label className="simple-search-row">
              <span className="simple-search-label">{t("simple.want")}</span>
              <input
                type="search"
                name="q"
                autoComplete="off"
                placeholder={t("simple.wantHint")}
              />
            </label>
            <div className="simple-search-row">
              <span className="simple-search-label" aria-hidden="true">
                {t("simple.in")}
              </span>
              <RegionPicker
                regions={regions.map((r) => ({
                  ...r,
                  name: r.name.replace(/^منطقة\s+/, ""),
                }))}
                value={region}
                path="/"
                autoLabel={texts["region.auto"]}
                detectingLabel={texts["region.detecting"]}
              />
              {region && <input type="hidden" name="region" value={region} />}
            </div>
            <button className="button simple-search-button" type="submit">
              {t("simple.search") || "ابحث"}
            </button>
          </form>
          <div className="simple-avail">
            <Link href="/browse?status=available" className="simple-avail-card">
              <span className="status-dot" aria-hidden="true" />
              <strong>{t("simple.now") || t("avail.now")}</strong>
              {t("simple.nowHint") && <small>{t("simple.nowHint")}</small>}
            </Link>
            <Link
              href="/browse?status=preorder"
              className="simple-avail-card warm"
            >
              <span aria-hidden="true">◷</span>
              <strong>{t("simple.preorder") || t("avail.order")}</strong>
              {t("simple.preorderHint") && (
                <small>{t("simple.preorderHint")}</small>
              )}
            </Link>
          </div>
        </div>
        <figure className="simple-arch">
          <Image
            src="/food/rice-plate-floating-v2.webp"
            alt={t("simple.archAlt")}
            width={560}
            height={560}
            sizes="(max-width:600px) 70vw, 380px"
            preload
            fetchPriority="high"
            loading="eager"
          />
        </figure>
      </section>
      {t("simple.trust") && (
        <p className="simple-trust wrap">
          <span aria-hidden="true">✓</span> {t("simple.trust")}
        </p>
      )}
      {producers.length > 0 && (
        <section
          className="section wrap home-producers"
          aria-labelledby="simple-nearby"
        >
          <div className="section-heading">
            <h2 id="simple-nearby">{t("simple.nearby")}</h2>
            <Link className="text-link" href="/producers">
              {t("simple.allFamilies") || "كل الأسر المنتجة"} ←
            </Link>
          </div>
          <div className="producer-grid compact">
            {producers.map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
