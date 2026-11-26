"use client";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useTx } from "@/components/site-texts";

/** صحن أعلى الرئيسية: منتج حقيقي (آخر الإضافات) أو صورة من صور الموقع. */
export type Plate = {
  id: string;
  name: string;
  image: string;
  /** للمنتج الحقيقي: رابطه وأسرته وسعره وعدد طلباته. */
  href?: string;
  family?: string;
  price?: string;
  orders?: number;
};

/** صور الموقع: تكمّل الصحون إن قلّت المنتجات ذات الصور عن ١٢. */
export const SITE_PLATES: Plate[] = [
  ["rice-plate", "طبق أرز"],
  ["traditional-platter", "مطازيز"],
  ["clay-pot", "مرقوق"],
  ["grain-plate", "جريش"],
  ["fish-tray", "طبق سمك"],
].map(([id, name]) => ({
  id: `site-${id}`,
  name,
  image: `/food/${id}-floating-v2.webp`,
}));

const Ctx = createContext<{
  plates: Plate[];
  selected: string;
  select: (id: string) => void;
} | null>(null);

/**
 * صحون أعلى الرئيسية (قرار المالك 2026-11-26): آخر ١٢ منتجًا، الجديد يحل محل الأقدم.
 * أربعة تحت القوس وثمانية بجانبه، والضغط على صحن يُظهر صورته وبياناته داخل القوس بخط صغير.
 */
export function PlatesProvider({
  plates,
  children,
}: {
  plates: Plate[];
  children: React.ReactNode;
}) {
  const [selected, select] = useState(plates[0]?.id ?? "");
  return (
    <Ctx.Provider value={{ plates, selected, select }}>{children}</Ctx.Provider>
  );
}

/** صور الموقع عبر Image بمقاسها؛ صور المنتجات (من رفع الأسر) تُعرض كما هي. */
const real = (plate: Plate) => !plate.id.startsWith("site-");

function PlateImage({ plate, sizes }: { plate: Plate; sizes: string }) {
  // صور المنتجات من رفع الأسر تُعرض كما هي؛ صور الموقع عبر Image.
  return real(plate) ? (
    <img src={plate.image} alt="" loading="lazy" />
  ) : (
    <Image src={plate.image} alt="" fill sizes={sizes} />
  );
}

function PlateButton({ plate }: { plate: Plate }) {
  const ctx = useContext(Ctx);
  const { txb } = useTx();
  if (!ctx) return null;
  const active = ctx.selected === plate.id;
  return (
    <button
      type="button"
      className={`food-dish${active ? " is-active" : ""}`}
      aria-pressed={active}
      aria-label={txb("plates.show", { name: plate.name })}
      onClick={() => ctx.select(plate.id)}
    >
      <span className="food-dish-visual">
        <PlateImage plate={plate} sizes="(max-width:600px) 18vw, 110px" />
        {(plate.orders ?? 0) > 0 && (
          <span
            className="order-badge"
            title={txb("count.productOrders", {
              n: plate.orders ?? 0,
            })}
          >
            {new Intl.NumberFormat("ar-SA").format(plate.orders ?? 0)}
          </span>
        )}
      </span>
    </button>
  );
}

/** القوس: الصحن المختار مكبّرًا وبياناته بخط صغير، وتحته أول أربعة صحون. */
export function FoodPhotos() {
  const ctx = useContext(Ctx);
  const { txb } = useTx();
  if (!ctx) return null;
  const main = ctx.plates.find((p) => p.id === ctx.selected) ?? ctx.plates[0];
  if (!main) return null;
  return (
    <figure className="food-showcase">
      <div className="food-showcase-main">
        {real(main) ? (
          <img key={main.id} src={main.image} alt={main.name} />
        ) : (
          <Image
            key={main.id}
            src={main.image}
            alt={main.name}
            fill
            sizes="(max-width:600px) 55vw, (max-width:850px) 40vw, 400px"
            preload={main.id === ctx.plates[0]?.id}
          />
        )}
        {main.href && (
          <figcaption className="food-showcase-caption" aria-live="polite">
            <strong>{main.name}</strong>
            <span>{[main.family, main.price].filter(Boolean).join(" · ")}</span>
            <Link href={main.href}>
              {txb("plates.details")} <span aria-hidden="true">←</span>
            </Link>
          </figcaption>
        )}
      </div>
      <div
        className="food-showcase-strip"
        role="group"
        aria-label={txb("plates.label")}
      >
        {ctx.plates.slice(0, 4).map((p) => (
          <PlateButton key={p.id} plate={p} />
        ))}
      </div>
    </figure>
  );
}

/** ثمانية صحون بجانب القوس (تحت البحث). */
export function SidePlates({ where }: { where: "wide" | "narrow" }) {
  const ctx = useContext(Ctx);
  const { txb } = useTx();
  const rest = ctx?.plates.slice(4, 12) ?? [];
  if (!rest.length) return null;
  return (
    <div
      className={`food-side-plates is-${where}`}
      role="group"
      aria-label={txb("plates.more")}
    >
      {rest.map((p) => (
        <PlateButton key={p.id} plate={p} />
      ))}
    </div>
  );
}
