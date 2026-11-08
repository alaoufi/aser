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
        <Image
          src="/food/rice-plate.jpeg"
          alt="طبق أرز باللحم والمكسرات"
          fill
          sizes="(max-width:600px) 85vw, (max-width:850px) 40vw, 480px"
          preload
        />
      </div>
      <div className="food-showcase-strip">
        {dishes.map(([id, alt]) => (
          <div key={id}>
            <Image
              src={`/food/${id}.jpeg`}
              alt={alt}
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
