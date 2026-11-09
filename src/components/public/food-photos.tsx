import Image from "next/image";
const dishes = [
  ["traditional-platter", "مطازيز"],
  ["clay-pot", "مرقوق"],
  ["grain-plate", "جريش"],
  ["fish-tray", "طبق سمك"],
];
export function FoodPhotos() {
  return (
    <figure className="food-showcase">
      <div className="food-showcase-main">
        <Image
          src="/food/rice-plate-floating-v2.webp"
          alt="طبق أرز"
          fill
          sizes="(max-width:600px) 85vw, (max-width:850px) 40vw, 480px"
          preload
        />
      </div>
      <div className="food-showcase-strip">
        {dishes.map(([id, name]) => (
          <div className="food-dish" key={id}>
            <div className="food-dish-visual">
              <Image
                src={`/food/${id}-floating-v2.webp`}
                alt={name}
                fill
                sizes="(max-width:600px) 20vw, 110px"
              />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
