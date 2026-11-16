"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Message, api, s } from "./shared";

type Data = {
  public: boolean;
  products: { id: string; name: string; family: string; views: number }[];
  producers: { id: string; slug: string; name: string; views: number }[];
};
const num = (n: number) => n.toLocaleString("en-US");

/**
 * الإدارة ← «المشاهدات والزوار»: زر واحد يجعل الأعداد ظاهرة للجميع أو للإدارة فقط
 * (العدّ يستمر في الحالتين)، وأكثر المنتجات والأسر مشاهدة.
 */
export function ViewsAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Data>("/api/admin/views")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  async function toggle(open: boolean) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<Data>("/api/admin/views", {
          method: "PUT",
          body: JSON.stringify({ public: open }),
        }),
      );
      setSuccess(
        open
          ? "تم ✓ المشاهدات والزوار ظاهرة الآن للجميع."
          : "تم ✓ المشاهدات والزوار ظاهرة للإدارة فقط.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="المشاهدات والزوار">
      <h2>المشاهدات والزوار</h2>
      <p className={s.muted}>
        تُحسب زيارات الموقع والتطبيقين ومشاهدات صفحات المنتجات والأسر دائمًا
        (زائر واحد لكل صفحة في اليوم، دون محركات البحث وزيارة الأسرة لصفحاتها).
        هنا تختار من يرى الأعداد.
      </p>
      <Message error={error} success={success} />
      {data && (
        <>
          <fieldset className={s.lookChoices}>
            <legend className="sr-only">ظهور المشاهدات</legend>
            <button
              type="button"
              className={s.lookChoice}
              aria-pressed={data.public}
              disabled={busy}
              onClick={() => toggle(true)}
            >
              <strong>مفعّلة للجميع</strong>
              <small>
                يرى كل الزوار «زوار اليوم، وإجمالي الزوار، والمتواجدون الآن»
                أسفل الصفحات، ومشاهدات كل منتج وأسرة.
              </small>
            </button>
            <button
              type="button"
              className={s.lookChoice}
              aria-pressed={!data.public}
              disabled={busy}
              onClick={() => toggle(false)}
            >
              <strong>للإدارة فقط</strong>
              <small>
                الأعداد مخفية عن الزوار، وتظهر لمن له صلاحية في الإدارة مع علامة
                «ظاهر للإدارة فقط».
              </small>
            </button>
          </fieldset>
          <h3>أكثر المنتجات مشاهدة</h3>
          {data.products.length ? (
            <ol>
              {data.products.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.id}`}>{p.name}</Link> ({p.family})
                  : <b>{num(p.views)}</b> مشاهدة
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.muted}>لا مشاهدات بعد.</p>
          )}
          <h3>أكثر الأسر مشاهدة</h3>
          {data.producers.length ? (
            <ol>
              {data.producers.map((p) => (
                <li key={p.id}>
                  <Link href={`/producers/${p.slug}`}>{p.name}</Link>:{" "}
                  <b>{num(p.views)}</b> مشاهدة
                </li>
              ))}
            </ol>
          ) : (
            <p className={s.muted}>لا مشاهدات بعد.</p>
          )}
        </>
      )}
    </section>
  );
}
