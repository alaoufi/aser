"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountShell, Guard, Message, api, s, useSession } from "./shared";
import v from "./family-views.module.css";

type Data = {
  slug: string;
  public: boolean;
  pageViews: number;
  productsViews: number;
  products: { id: string; name: string; visible: boolean; views: number }[];
};
const num = (n: number) => n.toLocaleString("en-US");

/**
 * لوحة الأسرة ← «المشاهدات»: مشاهدات صفحة الأسرة، وإجمالي مشاهدات منتجاتها، وعدد كل منتج.
 * زائر واحد لكل صفحة في اليوم، ولا تُحسب زيارة الأسرة لصفحاتها ولا محركات البحث.
 */
function FamilyViews() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Data>("/api/producer/views")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  const top = Math.max(1, ...(data?.products ?? []).map((p) => p.views));
  return (
    <>
      <Message error={error} />
      {!data && !error && <p role="status">جارٍ تحميل المشاهدات…</p>}
      {data && (
        <>
          <ul className={v.cards} aria-label="ملخص المشاهدات">
            <li>
              <strong>{num(data.pageViews)}</strong>
              <span>مشاهدات صفحة الأسرة</span>
            </li>
            <li>
              <strong>{num(data.productsViews)}</strong>
              <span>إجمالي مشاهدات المنتجات</span>
            </li>
            <li>
              <strong>{num(data.pageViews + data.productsViews)}</strong>
              <span>الإجمالي (الصفحة والمنتجات)</span>
            </li>
          </ul>
          <h2>مشاهدات كل منتج</h2>
          {data.products.length ? (
            <ol className={v.list} aria-label="مشاهدات المنتجات">
              {data.products.map((p) => (
                <li key={p.id}>
                  <span>
                    <Link href={`/products/${p.id}`}>{p.name}</Link>
                    {!p.visible && <small className={v.hidden}> (مخفي)</small>}
                  </span>
                  <b>{num(p.views)} مشاهدة</b>
                  <i
                    style={{ width: `${(p.views / top) * 100}%` }}
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.muted}>
              لا منتجات بعد.{" "}
              <Link href="/dashboard/products">أضف منتجًا ←</Link>
            </p>
          )}
          <p className={s.muted}>
            تُحسب مشاهدة واحدة لكل زائر لكل صفحة في اليوم، ولا تُحسب زيارتك
            لصفحاتك ولا محركات البحث. أرقامك هنا تظهر لك دائمًا.{" "}
            {data.public
              ? "والأعداد ظاهرة للزوار أيضًا في صفحتك."
              : "وهي مخفية عن الزوار الآن بقرار الإدارة."}{" "}
            <Link href={`/producers/${data.slug}`}>صفحة أسرتي ←</Link>
          </p>
        </>
      )}
    </>
  );
}

export function FamilyViewsPage() {
  const session = useSession();
  return (
    <AccountShell>
      <h1>المشاهدات</h1>
      <Guard {...session} />
      {session.user && <FamilyViews />}
    </AccountShell>
  );
}
