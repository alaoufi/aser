"use client";
import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";
import { useSession } from "@/components/forms/session";
import { ProductCard } from "./ui";

type Suggestion = { product: Product; reason: string };

/**
 * «مقترح لك» في الرئيسية للعضو المسجّل: أطباق في نطاقه مرتبة بذوقه، ولكل طبق سبب ظاهر.
 * الحساب كله في خادم الموقع من نشاط العضو نفسه، بلا أي خدمة خارجية.
 */
export function ForYou({
  region,
  labels,
}: {
  region: string;
  labels: Record<string, string>;
}) {
  const { user } = useSession();
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [personal, setPersonal] = useState(false);
  useEffect(() => {
    if (!user) {
      setItems(null);
      return;
    }
    let active = true;
    fetch(`/api/recommendations?region=${encodeURIComponent(region)}`)
      .then((r) => (r.ok ? r.json() : { items: [], personal: false }))
      .then((d: { items: Suggestion[]; personal: boolean }) => {
        if (!active) return;
        setItems(d.items);
        setPersonal(d.personal);
      })
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [user?.id, region]);
  if (!user || !items?.length) return null;
  return (
    <section className="section wrap for-you" aria-labelledby="for-you-title">
      <div className="section-heading">
        <h2 id="for-you-title">مقترح لك</h2>
        <p className="for-you-note">
          {personal
            ? "حسب طلباتك وتقييماتك وما تصفحته"
            : "الأكثر طلبًا قريبًا منك، ويتعلم ذوقك مع طلباتك"}
        </p>
      </div>
      <div className="product-grid">
        {items.map((s) => (
          <div key={s.product.id} className="for-you-item">
            <span className="for-you-reason">{s.reason}</span>
            <ProductCard product={s.product} labels={labels} />
          </div>
        ))}
      </div>
    </section>
  );
}
