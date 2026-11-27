"use client";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useTx } from "@/components/site-texts";

import type { Plate } from "@/lib/site-plates";

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

/** مكان فارغ في المسار: صحن منقّط برقم مكانه، يمتلئ حين تُضاف منتجات جديدة. */
function EmptyPlate({ at }: { at: number }) {
  return (
    <span className="food-dish is-empty" aria-hidden="true">
      <span className="food-dish-visual">
        <span className="food-slot-no">
          {new Intl.NumberFormat("ar-SA").format(at + 1)}
        </span>
      </span>
    </span>
  );
}

/**
 * الصحون حول القوس (رسم المالك 2026-11-27): ثلاثة صفوف، في كل صف أربعة.
 * الترتيب يدور: ١ أسفل اليسار (الأحدث) صعودًا، ثم الصف العلوي من اليسار لليمين،
 * ثم العمود الأيمن نزولًا. القوس في الوسط، والصحن فيه أكبر ومرفوع، ومعه بياناته.
 */
export function FoodPhotos() {
  const ctx = useContext(Ctx);
  const { txb } = useTx();
  if (!ctx) return null;
  const main = ctx.plates.find((p) => p.id === ctx.selected) ?? ctx.plates[0];
  if (!main) return null;
  // كل صف أربعة أماكن: المنتج إن وُجد، وإلا صحن فارغ برقم مكانه (يمتلئ بالمنتجات الجديدة).
  const line = (from: number) =>
    [0, 1, 2, 3].map((i) => ({ at: from + i, plate: ctx.plates[from + i] }));
  return (
    <figure className="food-showcase food-ring">
      {/* مسار انتقال المنتجات: من ١ أسفل اليسار صعودًا، ثم الأعلى، ثم اليمين نزولًا. */}
      <span className="food-ring-path" aria-hidden="true" />
      <div className="food-showcase-main">
        {real(main) ? (
          <img key={main.id} src={main.image} alt={main.name} />
        ) : (
          <Image
            key={main.id}
            src={main.image}
            alt={main.name}
            fill
            sizes="(max-width:600px) 55vw, (max-width:850px) 34vw, 320px"
            preload={main.id === ctx.plates[0]?.id}
          />
        )}
        {/* الضغط على الصحن المكبّر يفتح تفاصيل المنتج (طلب المالك 2026-11-27).
            للوحة المفاتيح وقارئات الشاشة رابط «التفاصيل» نفسه، فلا يتكرر. */}
        {main.href && (
          <Link
            href={main.href}
            className="food-showcase-open"
            tabIndex={-1}
            aria-hidden="true"
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
      {/* العمود الأيسر: ١ (الأحدث) في الأسفل صعودًا إلى ٤. */}
      <div
        className="food-ring-line is-left"
        role="group"
        aria-label={txb("plates.label")}
      >
        {line(0).map(({ at, plate }) =>
          plate ? (
            <PlateButton key={plate.id} plate={plate} />
          ) : (
            <EmptyPlate key={`empty-${at}`} at={at} />
          ),
        )}
      </div>
      <div
        className="food-ring-line is-top"
        role="group"
        aria-label={txb("plates.more")}
      >
        {line(4).map(({ at, plate }) =>
          plate ? (
            <PlateButton key={plate.id} plate={plate} />
          ) : (
            <EmptyPlate key={`empty-${at}`} at={at} />
          ),
        )}
      </div>
      <div
        className="food-ring-line is-right"
        role="group"
        aria-label={txb("plates.rest")}
      >
        {line(8).map(({ at, plate }) =>
          plate ? (
            <PlateButton key={plate.id} plate={plate} />
          ) : (
            <EmptyPlate key={`empty-${at}`} at={at} />
          ),
        )}
      </div>
    </figure>
  );
}
