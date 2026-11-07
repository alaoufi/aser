import type { Category, City, Producer, Product, Filters } from "../lib/types";
import { db, databaseConfigured } from "./db";
import { categories, cities } from "./constants";
export async function getCategories(): Promise<Category[]> {
  return databaseConfigured()
    ? (
        await db().query(
          "SELECT id,name,slug,icon FROM jdatna.categories ORDER BY length(id),id",
        )
      ).rows
    : categories;
}
export async function getCities(): Promise<City[]> {
  return databaseConfigured()
    ? (
        await db().query(
          'SELECT c.id,c.name,c.region_id AS "regionId",r.name AS "regionName" FROM jdatna.cities c JOIN jdatna.regions r ON r.id=c.region_id ORDER BY c.name',
        )
      ).rows
    : cities;
}
export const producerSelect = `SELECT p.id,p.slug,p.name,p.description,p.city_id AS "cityId",
c.name AS "cityName",r.name AS "regionName",p.neighborhood,p.verified,p.phone,p.whatsapp,
p.delivery,p.pickup,(SELECT s.url FROM jdatna.producer_social_links s WHERE s.producer_id=p.id AND s.platform='website') AS website,p.logo_url AS "logoUrl",p.cover_url AS "coverUrl",
COALESCE((SELECT json_agg(json_build_object('platform',s.platform,'url',s.url))
 FROM jdatna.producer_social_links s WHERE s.producer_id=p.id AND s.platform<>'website'),'[]') AS "socialLinks",
COALESCE((SELECT json_agg(json_build_object('cityId',a.city_id,'cityName',ac.name,'fee',a.fee) ORDER BY ac.name)
 FROM jdatna.delivery_areas a JOIN jdatna.cities ac ON ac.id=a.city_id WHERE a.producer_id=p.id),'[]') AS "deliveryAreas",
(SELECT string_agg((CASE b.day WHEN 0 THEN 'الأحد' WHEN 1 THEN 'الاثنين' WHEN 2 THEN 'الثلاثاء'
 WHEN 3 THEN 'الأربعاء' WHEN 4 THEN 'الخميس' WHEN 5 THEN 'الجمعة' WHEN 6 THEN 'السبت' END)
 ||': '||to_char(b.opens,'HH24:MI')||' - '||to_char(b.closes,'HH24:MI'), E'\\n' ORDER BY b.day)
 FROM jdatna.business_hours b WHERE b.producer_id=p.id) AS "businessHours"
FROM jdatna.producer_profiles p JOIN jdatna.cities c ON c.id=p.city_id
JOIN jdatna.regions r ON r.id=c.region_id`;
export const productSelect = `SELECT x.id,x.producer_id AS "producerId",p.name AS "producerName",p.slug AS "producerSlug",c.name AS "cityName",x.name,x.description,x.price,x.unit,x.status,x.image_url AS "imageUrl",ARRAY(SELECT category_id FROM jdatna.product_categories WHERE product_id=x.id) AS "categoryIds",ARRAY(SELECT name FROM jdatna.product_allergens WHERE product_id=x.id) AS allergens,x.ingredients,x.storage,x.shelf_life AS "shelfLife",x.preparation_time AS "preparationTime",x.story,p.delivery FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id JOIN jdatna.cities c ON c.id=p.city_id`;
export function mapProduct(row: Product): Product {
  return { ...row, price: row.price === null ? null : Number(row.price) };
}
function conditions(f: Filters, products: boolean) {
  const args: unknown[] = [];
  const where = [
    "p.status='approved'",
    ...(products ? ["x.visible=true"] : []),
  ];
  const add = (sql: string, value: unknown) => {
    args.push(value);
    where.push(sql.replaceAll("?", () => "$" + args.length));
  };
  if (f.q)
    add(
      products
        ? "(x.name ILIKE ? OR x.description ILIKE ? OR p.name ILIKE ?)"
        : "(p.name ILIKE ? OR p.description ILIKE ?)",
      `%${f.q.slice(0, 120).replace(/[\\%_]/g, "\\$&")}%`,
    );
  if (f.city) add("p.city_id=?", f.city);
  if (f.category)
    add(
      products
        ? "EXISTS(SELECT 1 FROM jdatna.product_categories pc WHERE pc.product_id=x.id AND pc.category_id=?)"
        : "EXISTS(SELECT 1 FROM jdatna.producer_categories pc WHERE pc.producer_id=p.id AND pc.category_id=?)",
      f.category,
    );
  if (products && f.status) add("x.status=?", f.status);
  if (f.delivery === "true") where.push("p.delivery=true");
  if (f.delivery === "pickup") where.push("p.pickup=true");
  return { args, where: where.join(" AND ") };
}
export async function searchProducts(
  filters: Filters = {},
): Promise<Product[]> {
  if (!databaseConfigured()) return [];
  const { args, where } = conditions(filters, true);
  args.push((Math.max(1, Math.min(1000, Number(filters.page) || 1)) - 1) * 24);
  return (
    await db().query(
      `${productSelect} WHERE ${where} ORDER BY x.featured DESC,x.created_at DESC LIMIT 24 OFFSET $${args.length}`,
      args,
    )
  ).rows.map(mapProduct);
}
export async function searchProducers(
  filters: Filters = {},
): Promise<Producer[]> {
  if (!databaseConfigured()) return [];
  const { args, where } = conditions(filters, false);
  args.push((Math.max(1, Math.min(1000, Number(filters.page) || 1)) - 1) * 24);
  return (
    await db().query(
      `${producerSelect} WHERE ${where} ORDER BY p.created_at DESC LIMIT 24 OFFSET $${args.length}`,
      args,
    )
  ).rows;
}
export async function getProducer(slug: string): Promise<Producer | null> {
  if (!databaseConfigured()) return null;
  return (
    (
      await db().query(
        `${producerSelect} WHERE p.slug=$1 AND p.status='approved'`,
        [slug],
      )
    ).rows[0] ?? null
  );
}
export async function getProduct(id: string): Promise<Product | null> {
  if (!databaseConfigured() || !/^[a-f0-9-]{36}$/i.test(id)) return null;
  const row = (
    await db().query(
      `${productSelect} WHERE x.id=$1 AND x.visible=true AND p.status='approved'`,
      [id],
    )
  ).rows[0];
  return row ? mapProduct(row) : null;
}
export async function getProducerProducts(
  producerId: string,
): Promise<Product[]> {
  if (!databaseConfigured() || !/^[a-f0-9-]{36}$/i.test(producerId)) return [];
  return (
    await db().query(
      `${productSelect} WHERE p.id=$1 AND p.status='approved' AND x.visible=true ORDER BY x.created_at DESC LIMIT 100`,
      [producerId],
    )
  ).rows.map(mapProduct);
}
