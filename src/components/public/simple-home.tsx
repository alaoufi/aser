import Image from "next/image";
import Link from "next/link";
import type { Product, Producer } from "@/lib/types";
import type { SiteTexts } from "@/lib/site-texts";
import { RegionPicker } from "@/components/public/region-picker";
import { priceLabel, safeMediaUrl } from "@/components/public/ui";

/**
 * الرئيسية في القالب المبسّط — اتجاه «المائدة» الذي اختاره المالك (2026-11-26):
 * صحن كبير يقطعه طرف الشاشة فوق مفرش سدو، والبحث جملة واحدة «أحب أكلات … في …»،
 * ثم «مائدة اليوم»: أطباق اليوم الحقيقية من القاعدة على المفرش (صورة، اسم، سعر، الأسرة)،
 * وحالة فارغة لائقة. بلا الطاولة الخشبية وبلا الشارة العائمة. كل النصوص من «نصوص الموقع».
 */
export function SimpleHome({
  texts,
  regions,
  region,
  producers,
  today,
}: {
  texts: SiteTexts;
  regions: { id: string; name: string }[];
  region: string;
  producers: Producer[];
  today: Product[];
}) {
  const t = (k: keyof SiteTexts) => texts[k];
  return (
    <>
      <section className="maeda-hero" aria-labelledby="simple-title">
        <div className="maeda-copy wrap">
          {t("simple.kicker") && (
            <p className="maeda-kicker">{t("simple.kicker")}</p>
          )}
          <h1 id="simple-title" className="maeda-title">
            {t("simple.title")}
          </h1>
          {t("simple.lead") && (
            <p className="maeda-lead">
              {t("simple.lead").replace("{regions}", String(regions.length))}
            </p>
          )}
        </div>
        <div className="maeda-runner" aria-hidden="true" />
        <Image
          className="maeda-plate"
          src="/food/traditional-platter-floating-v2.webp"
          alt={t("simple.archAlt")}
          width={640}
          height={640}
          sizes="(max-width:760px) 430px, 640px"
          preload
          fetchPriority="high"
          loading="eager"
        />
      </section>
      <form action="/browse" className="maeda-search wrap" autoComplete="off">
        <div className="maeda-sentence">
          <label className="maeda-row">
            <span className="maeda-word">{t("simple.want")}</span>
            <input
              type="search"
              name="q"
              autoComplete="off"
              placeholder={t("simple.wantHint")}
            />
          </label>
          <div className="maeda-row">
            <span className="maeda-word" aria-hidden="true">
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
        </div>
        <button className="button maeda-go" type="submit">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            />
            <path
              d="m16 16 4.5 4.5"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          {t("simple.search") || "ابحث"}
        </button>
      </form>

      <section className="maeda-table" aria-labelledby="maeda-today">
        <div className="wrap">
          <div className="maeda-head">
            <h2 id="maeda-today">{t("simple.table")}</h2>
            {today.length > 0 && (
              <Link className="text-link" href="/browse?status=available">
                {t("simple.tableAll")} ←
              </Link>
            )}
          </div>
          {t("simple.tableHint") && (
            <p className="maeda-hint">{t("simple.tableHint")}</p>
          )}
          {today.length > 0 ? (
            <div className="maeda-cloth">
              <ul className="maeda-dishes">
                {today.map((p) => {
                  const image = p.imageUrl && safeMediaUrl(p.imageUrl);
                  return (
                    <li key={p.id}>
                      <Link href={`/products/${p.id}`} className="maeda-dish">
                        <span className="maeda-dish-plate">
                          {image ? (
                            <img src={image} alt="" loading="lazy" />
                          ) : (
                            <span
                              className="maeda-dish-initial"
                              aria-hidden="true"
                            >
                              {p.name.trim().charAt(0)}
                            </span>
                          )}
                        </span>
                        <strong>{p.name}</strong>
                        <small>{p.producerName}</small>
                        <span className="maeda-price">
                          {priceLabel(p.price)}
                          {p.price !== null && <small> / {p.unit}</small>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="maeda-empty">
              <span className="maeda-empty-plate" aria-hidden="true" />
              <strong>{t("simple.tableEmptyTitle")}</strong>
              {t("simple.tableEmpty") && <p>{t("simple.tableEmpty")}</p>}
              <Link className="button secondary" href="/browse?status=preorder">
                {t("simple.tableEmptyCta")}
              </Link>
            </div>
          )}
        </div>
      </section>

      <nav className="maeda-index wrap" aria-label={t("simple.indexLabel")}>
        <Link href="/browse?status=available">
          <span>
            <strong>
              <span className="maeda-dot" aria-hidden="true" />
              {t("simple.now") || t("avail.now")}
            </strong>
            {t("simple.nowHint") && <small>{t("simple.nowHint")}</small>}
          </span>
          <span aria-hidden="true">←</span>
        </Link>
        <Link href="/browse?status=preorder">
          <span>
            <strong>
              <span className="maeda-clock" aria-hidden="true">
                ◷
              </span>
              {t("simple.preorder") || t("avail.order")}
            </strong>
            {t("simple.preorderHint") && (
              <small>{t("simple.preorderHint")}</small>
            )}
          </span>
          <span aria-hidden="true">←</span>
        </Link>
      </nav>

      {t("simple.trust") && (
        <p className="maeda-trust wrap">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 2.8 14.3 5l3.1-.4.9 3 2.8 1.5-.9 3 .9 3-2.8 1.5-.9 3-3.1-.4L12 21.2 9.7 19l-3.1.4-.9-3L2.9 15l.9-3-.9-3 2.8-1.5.9-3 3.1.4z"
              fill="currentColor"
            />
            <path
              d="m8.3 12.2 2.4 2.4 5-5"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("simple.trust")}
        </p>
      )}

      {producers.length > 0 && (
        <section
          className="maeda-families wrap"
          aria-labelledby="simple-nearby"
        >
          <div className="maeda-head">
            <h2 id="simple-nearby">{t("simple.nearby")}</h2>
            <Link className="text-link" href="/producers">
              {t("simple.allFamilies") || "كل الأسر المنتجة"} ←
            </Link>
          </div>
          <ul className="maeda-family-list">
            {producers.map((p) => {
              const logo = p.logoUrl && safeMediaUrl(p.logoUrl);
              return (
                <li key={p.id}>
                  <Link href={`/producers/${p.slug}`} className="maeda-family">
                    <span className="maeda-family-mark" aria-hidden="true">
                      {logo ? (
                        <img src={logo} alt="" loading="lazy" />
                      ) : (
                        p.name.trim().charAt(0)
                      )}
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.cityName}
                        {p.neighborhood ? ` · ${p.neighborhood}` : ""}
                      </small>
                    </span>
                    <span aria-hidden="true">←</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
