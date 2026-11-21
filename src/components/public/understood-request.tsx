import Link from "next/link";
import { describeFood, type FoodIntent } from "@/lib/food-intent";
import { DISHES, dishPath } from "@/lib/dishes";

/**
 * «فهمنا طلبك»: ما فهمه الموقع من جملة العميل، وسؤال واحد عن أول ما ينقص الطلب
 * (الأكلة، ثم المكان). الحساب في الخادم بلا أي خدمة خارجية (food-intent.ts).
 */
export function UnderstoodRequest({
  intent,
  asked,
  regions,
}: {
  intent: FoodIntent;
  asked: string;
  regions: { id: string; name: string }[];
}) {
  const { parts, missing } = describeFood(intent);
  const withRegion = (region: string) =>
    `/browse?q=${encodeURIComponent(intent.search)}&region=${encodeURIComponent(region)}`;
  return (
    <section className="understood" aria-labelledby="understood-title">
      <h2 id="understood-title">فهمنا طلبك</h2>
      <p className="understood-asked">«{asked}»</p>
      {parts.length > 0 && (
        <ul className="understood-parts">
          {parts.map((p) => (
            <li key={p.label}>
              <span>{p.label}</span>
              <strong>{p.value}</strong>
            </li>
          ))}
        </ul>
      )}
      {missing === "dish" && (
        <div className="understood-ask">
          <p>
            <strong>وش الأكلة اللي تبيها؟</strong> اختر، أو اكتب اسمها مع طلبك:
          </p>
          <p className="understood-choices">
            {DISHES.slice(0, 8).map((d) => (
              <Link
                key={d.slug}
                href={`/browse?q=${encodeURIComponent(`${d.search} ${asked}`)}`}
                prefetch={false}
              >
                {d.name}
              </Link>
            ))}
          </p>
        </div>
      )}
      {missing === "place" && (
        <div className="understood-ask">
          <p>
            <strong>وين؟</strong> اختر منطقتك لنعرض أسرًا تصلك:
          </p>
          <p className="understood-choices">
            {regions.map((r) => (
              <Link key={r.id} href={withRegion(r.id)} prefetch={false}>
                {r.name}
              </Link>
            ))}
          </p>
        </div>
      )}
      {(intent.count || intent.budget || intent.quantity) && (
        <p className="understood-note">
          الأسعار المعروضة لكل وحدة. اطلب من الأسرة مباشرة أو راسلها لتأكيد
          الكمية والسعر{intent.count?.unit === "people" ? " لعددكم" : ""}
          {intent.budget ? " ضمن ميزانيتك" : ""}.
        </p>
      )}
      {intent.dishes.length > 0 && (
        <p className="understood-note">
          تعرّف على{" "}
          {intent.dishes.map((d, i) => (
            <span key={d.slug}>
              {i > 0 && "، "}
              <Link href={dishPath(d)} prefetch={false}>
                {d.name}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
    </section>
  );
}
