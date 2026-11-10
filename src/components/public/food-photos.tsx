"use client";
import Image from "next/image";
import { useState } from "react";

const dishes = [
  ["rice-plate", "طبق أرز"],
  ["traditional-platter", "مطازيز"],
  ["clay-pot", "مرقوق"],
  ["grain-plate", "جريش"],
  ["fish-tray", "طبق سمك"],
] as const;

/** خمسة صحون: يُعرض المختار منها مكبّرًا، والضغط على أي صحن صغير يكبّره. */
export function FoodPhotos() {
  const [selected, setSelected] = useState<string>("rice-plate");
  const main = dishes.find(([id]) => id === selected) ?? dishes[0];
  return (
    <figure className="food-showcase">
      <div className="food-showcase-main">
        <Image
          key={main[0]}
          src={`/food/${main[0]}-floating-v2.webp`}
          alt={main[1]}
          fill
          sizes="(max-width:600px) 85vw, (max-width:850px) 40vw, 480px"
          preload={main[0] === "rice-plate"}
        />
      </div>
      <div
        className="food-showcase-strip"
        role="group"
        aria-label="اختر صحنًا لعرضه مكبرًا"
      >
        {dishes
          .filter(([id]) => id !== selected)
          .map(([id, name]) => (
            <button
              type="button"
              className="food-dish"
              key={id}
              aria-label={`كبّر ${name}`}
              onClick={() => setSelected(id)}
            >
              <span className="food-dish-visual">
                <Image
                  src={`/food/${id}-floating-v2.webp`}
                  alt=""
                  fill
                  sizes="(max-width:600px) 20vw, 110px"
                />
              </span>
            </button>
          ))}
      </div>
    </figure>
  );
}
