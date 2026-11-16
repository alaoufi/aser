import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getCities } from "@/server/catalog";
import {
  subscriptionFamilies,
  planLabels,
  mealLabels,
} from "@/server/subscriptions";
import { RegionPicker } from "@/components/public/region-picker";
import { regionsOf } from "@/components/public/today-table";
import { Stars } from "@/components/public/stars";
import { EmptyState } from "@/components/public/ui";
import { SubscriptionRequest } from "@/components/forms/subscriptions";
import { openGraph } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "الاشتراكات — أكل بيت يومي وأسبوعي وشهري",
  description:
    "اشترك في أكل البيت من الأسر المنتجة القريبة منك: اشتراك يومي أو أسبوعي أو شهري أو لمدة محددة، فطور وغداء وعشاء مع التوصيل.",
  alternates: { canonical: "/subscriptions" },
  openGraph: openGraph({
    title: "الاشتراكات — أكل بيت يومي وأسبوعي وشهري",
    url: "/subscriptions",
  }),
};

/** «الاشتراكات»: أسر منطقة العميل التي تقبل الاشتراك، ولكل أسرة «طلب اشتراك». */
export default async function Subscriptions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const saved = (await cookies()).get("jdatna_region")?.value ?? "";
  const region = typeof params.region === "string" ? params.region : saved;
  const [cities, families] = await Promise.all([
    getCities(),
    subscriptionFamilies({ region }),
  ]);
  const regions = regionsOf(cities);
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">أكل بيت كل يوم</p>
        <h1>الاشتراكات</h1>
        <p>
          اختر أسرة في منطقتك، ثم اطلب اشتراكًا يوميًا أو أسبوعيًا أو شهريًا أو
          لمدة محددة، وتتفق معها في المحادثة.
        </p>
      </div>
      <p>
        <Link href="/my-subscriptions" className="text-link">
          اشتراكاتي وأطباقي ←
        </Link>
      </p>
      <div className="browse-scope">
        <RegionPicker regions={regions} value={region} path="/subscriptions" />
      </div>
      {families.length === 0 ? (
        <EmptyState
          title="لا توجد أسر تقبل الاشتراكات في منطقتك الآن"
          text="جرّب منطقة أخرى، أو عد قريبًا."
        />
      ) : (
        <ul className="subscription-list" aria-label="أسر تقبل الاشتراكات">
          {families.map((f) => (
            <li key={f.id} className="subscription-card">
              <h2>
                <Link href={`/producers/${f.slug}`}>{f.name}</Link>
              </h2>
              <p className="muted">
                {f.cityName} · {f.regionName}
              </p>
              <Stars value={f.ratingAverage} count={f.ratingCount} size={14} />
              <p className="subscription-tags">
                {f.plans.map((p) => (
                  <span key={p}>{planLabels[p]}</span>
                ))}
              </p>
              <p>
                {f.meals.map((m) => mealLabels[m]).join(" · ")}
                {f.delivery ? " · مع التوصيل" : " · استلام"}
              </p>
              {f.notes && <p className="muted">{f.notes}</p>}
              {f.menu.length > 0 && (
                <dl className="subscription-menu">
                  {f.meals.map((m) => {
                    const dishes = f.menu.filter((x) => x.meal === m);
                    return dishes.length ? (
                      <div key={m}>
                        <dt>{mealLabels[m]}</dt>
                        <dd>{dishes.map((x) => x.name).join("، ")}</dd>
                      </div>
                    ) : null;
                  })}
                </dl>
              )}
              <SubscriptionRequest
                family={f.slug}
                familyName={f.name}
                plans={f.plans}
                meals={f.meals}
                delivery={f.delivery}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
