import {
  shapeGeometry,
  tableData,
  tableStyle,
  type FamilyTableDesign,
} from "@/lib/family-table";
import Link from "next/link";
import { safeMediaUrl } from "./ui";

export type TableDish = { id: string; name: string; imageUrl?: string | null };

/** كم طبقًا تتسع له المائدة حسب شكلها وطريقة العرض. */
export function tableCapacity(d: FamilyTableDesign) {
  const wide = shapeGeometry[d.shape].wide;
  if (d.display === "row") return wide ? 6 : 4;
  if (d.display === "ring") return 8;
  return wide ? 8 : 6;
}

/**
 * مائدة الأسرة: شكلها ولونها وزخرفتها وإطارها من مكتبة الموائد، وعليها «حياكم الله» وأطباقها.
 * بلا حالة ولا أحداث، فتعمل في صفحة الأسرة (خادم) وفي معاينة لوحة الأسرة (متصفح).
 */
export function FamilyTable({
  design,
  dishes,
  welcome,
  empty,
  label,
  link = true,
}: {
  design: FamilyTableDesign;
  dishes: TableDish[];
  welcome: string;
  empty: string;
  /** اسم المائدة لقارئ الشاشة. */
  label: string;
  /** الأطباق روابط لصفحاتها (لا في المعاينة). */
  link?: boolean;
}) {
  const shown = dishes.slice(0, tableCapacity(design));
  return (
    <figure
      className="ftable"
      {...tableData(design)}
      style={tableStyle(design)}
      aria-label={label}
    >
      <div className="ft-stage">
        {design.height === "floor" && (
          <span className="ft-rug" aria-hidden="true" />
        )}
        <div className="ft-top">
          <span className="ft-edge" aria-hidden="true" />
          <span className="ft-line" aria-hidden="true" />
          <span className="ft-wood" aria-hidden="true" />
          <div className="ft-content">
            {welcome && <p className="ft-welcome">{welcome}</p>}
            {shown.length ? (
              <ul
                className="ft-dishes"
                style={{ "--n": shown.length } as React.CSSProperties}
              >
                {shown.map((d, i) => {
                  const img = d.imageUrl && safeMediaUrl(d.imageUrl);
                  const body = (
                    <>
                      <span className="ft-plate">
                        {img ? (
                          <img src={img} alt="" loading="lazy" />
                        ) : (
                          <span aria-hidden="true">♨</span>
                        )}
                      </span>
                      <span className="ft-name">{d.name}</span>
                    </>
                  );
                  return (
                    <li key={d.id} style={{ "--i": i } as React.CSSProperties}>
                      {link ? (
                        <Link href={`/products/${d.id}`} className="ft-dish">
                          {body}
                        </Link>
                      ) : (
                        <span className="ft-dish">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              empty && <p className="ft-empty">{empty}</p>
            )}
          </div>
        </div>
        {design.height !== "floor" && (
          <>
            <span className="ft-leg is-1" aria-hidden="true" />
            <span className="ft-leg is-2" aria-hidden="true" />
          </>
        )}
      </div>
    </figure>
  );
}
