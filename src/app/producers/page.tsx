import { LocationFields } from "@/components/public/location-fields";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getCities, regionalProducers } from "@/server/catalog";
import { EmptyState, ProducerCard } from "@/components/public/ui";
export const metadata: Metadata = { title: "الأسر المنتجة" };
export const dynamic = "force-dynamic";
export default async function Producers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const city = typeof params.city === "string" ? params.city : "";
  // النطاق: المنطقة في الرابط، وإلا المحفوظة في الجهاز (مثل الرئيسية و«طبخات اليوم»).
  const saved = (await cookies()).get("jdatna_region")?.value ?? "";
  const region = typeof params.region === "string" ? params.region : saved;
  const [cities, { local: producers, nationwide }] = await Promise.all([
    getCities(),
    regionalProducers({ q, city, region }),
  ]);
  const scopeName =
    cities.find((c) => c.id === city)?.name ??
    cities.find((c) => c.regionId === region)?.regionName ??
    "";
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">أيدٍ تحفظ الموروث</p>
        <h1>الأسر المنتجة</h1>
        <p>تعرّف على أهل الصنعة، واكتشف حكاية كل نكهة.</p>
      </div>
      <form
        className="filter-bar compact"
        action="/producers"
        autoComplete="off"
      >
        <label>
          اسم الأسرة المنتجة
          <input
            type="search"
            name="q"
            autoComplete="off"
            defaultValue={q}
            placeholder="ابحث باسم الأسرة المنتجة"
          />
        </label>
        <LocationFields
          key={`${region}:${city}`}
          cities={cities}
          defaultRegion={region}
          defaultCity={city}
        />
        <button className="button">ابحث عن أسرة</button>
      </form>
      {scopeName && (
        <div className="results-heading">
          <h2>
            {producers.length} أسرة في {scopeName}
          </h2>
        </div>
      )}
      {producers.length ? (
        <div className="producer-grid">
          {producers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="لا توجد أسر تطابق بحثك"
          text={
            scopeName
              ? `لا توجد أسر منشورة في ${scopeName} تطابق البحث. اختر «كل المناطق» أو منطقة أخرى، أو انظر الأسر التي تشحن لكل المناطق.`
              : "لا توجد أسر منشورة تطابق البحث حاليًا. تظهر الأسرة المنتجة بعد مراجعة حسابها والموافقة على النشر."
          }
        />
      )}
      {nationwide.length > 0 && (
        <section aria-label="أسر تشحن لكل المناطق" className="nationwide">
          <div className="results-heading">
            <h2>أسر تشحن لكل المناطق ({nationwide.length})</h2>
          </div>
          <div className="producer-grid">
            {nationwide.map((p) => (
              <ProducerCard key={p.id} producer={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
