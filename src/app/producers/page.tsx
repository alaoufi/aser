import type { Metadata } from "next";
import { getCities, searchProducers } from "@/server/catalog";
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
  const [cities, producers] = await Promise.all([
    getCities(),
    searchProducers({ q, city }),
  ]);
  return (
    <div className="wrap page-space">
      <div className="page-intro">
        <p className="eyebrow">أيدٍ تحفظ الموروث</p>
        <h1>الأسر المنتجة</h1>
        <p>تعرّف على أهل الصنعة، واكتشف حكاية كل نكهة.</p>
      </div>
      <form className="filter-bar compact" action="/producers">
        <label>
          اسم الأسرة
          <input name="q" defaultValue={q} placeholder="ابحث باسم الأسرة" />
        </label>
        <label>
          المدينة
          <select name="city" defaultValue={city}>
            <option value="">كل المدن</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button">ابحث عن أسرة</button>
      </form>
      {producers.length ? (
        <div className="producer-grid">
          {producers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="حكايات الأسر تأتي قريبًا"
          text="لا توجد أسر منشورة تطابق البحث حاليًا. تظهر الأسرة بعد مراجعة حسابها والموافقة على النشر."
        />
      )}
    </div>
  );
}
