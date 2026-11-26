import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  changeFollow,
  myFollow,
  myFollows,
  saveFollow,
} from "@/server/family-alerts";
import { db } from "@/server/db";
/**
 * «تنبيهات الأسرة» للعضو: قائمة متابعاته، أو متابعة أسرة واحدة (?producer=) مع منتجاتها للاختيار.
 */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const slug = new URL(request.url).searchParams.get("producer");
  if (!slug) return json({ follows: await myFollows(user) });
  const products = (
    await db().query(
      `SELECT x.id,x.name FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
       WHERE p.slug=$1 AND p.status='approved' AND x.visible AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 100`,
      [slug.slice(0, 200)],
    )
  ).rows;
  return json({ follow: await myFollow(user, slug.slice(0, 200)), products });
});
/** متابعة أسرة أو تعديل ما يصل منها (بموافقة صريحة). */
export const PUT = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("family-follow:" + user.id, 60, 3600);
  return json(await saveFollow(user, await jsonBody(request)));
}, true);
/** إيقاف مؤقت، استئناف، أو إلغاء. */
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("family-follow:" + user.id, 120, 3600);
  return json(await changeFollow(user, await jsonBody(request)));
}, true);
