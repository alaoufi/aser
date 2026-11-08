import Image from "next/image";
const dishes = [
  ["traditional-platter", "طبق تراثي باللحم والخضار"],
  ["clay-pot", "طبق شعبي في إناء فخاري"],
  ["grain-plate", "طبق شعبي مزين بالليمون والفلفل"],
  ["fish-tray", "صينية سمك بالخضار"],
];
export function FoodPhotos() {
  return (
    <figure className="food-showcase">
      <div className="food-showcase-main">
        <span className="dish-number" aria-hidden="true">
          1
        </span>
        <Image
          src="/food/rice-plate-cutout.png"
          alt="الطبق 1: أرز باللحم والمكسرات"
          fill
          sizes="(max-width:600px) 85vw, (max-width:850px) 40vw, 480px"
          preload
        />
      </div>
      <div className="food-showcase-strip">
        {dishes.map(([id, alt], index) => (
          <div key={id}>
            <span className="dish-number" aria-hidden="true">
              {index + 2}
            </span>
            <Image
              src={`/food/${id}-cutout.png`}
              alt={`الطبق ${index + 2}: ${alt}`}
              fill
              sizes="(max-width:600px) 20vw, 110px"
            />
          </div>
        ))}
      </div>
      <figcaption>من سفرتنا، ومن موروثنا</figcaption>
    </figure>
  );
}
