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
        <span className="dish-number" aria-hidden="true">
          1
        </span>
        <Image
          src="/food/rice-plate-floating-v2.webp"
          alt="الطبق 1: الأرز"
          fill
          sizes="(max-width:600px) 85vw, (max-width:850px) 40vw, 480px"
          preload
        />
      </div>
      <span className="food-dish-name food-dish-name-featured">الأرز</span>
      <div className="food-showcase-strip">
        {dishes.map(([id, name], index) => (
          <div className="food-dish" key={id}>
            <div className="food-dish-visual">
              <span className="dish-number" aria-hidden="true">
                {index + 2}
              </span>
              <Image
                src={`/food/${id}-floating-v2.webp`}
                alt={`الطبق ${index + 2}: ${name}`}
                fill
                sizes="(max-width:600px) 20vw, 110px"
              />
            </div>
            <span className="food-dish-name">{name}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
