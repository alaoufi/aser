import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
import { inSaudiBounds, pointInPolygon, type LatLng } from "../lib/geo";

export type Zone = {
  id: string;
  name: string;
  fee: number | null;
  points: LatLng[];
};

const point = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine((p) => inSaudiBounds(p as LatLng), "النقطة خارج المملكة");
const zonesSchema = z
  .object({
    zones: z
      .array(
        z
          .object({
            name: z.string().trim().min(1, "سمِّ المنطقة").max(80),
            fee: z
              .number()
              .min(0)
              .max(99999999.99)
              .multipleOf(0.01)
              .nullable()
              .optional(),
            points: z
              .array(point)
              .min(3, "المنطقة تحتاج ثلاث نقاط على الأقل")
              .max(200),
          })
          .strict(),
      )
      .max(10, "عشر مناطق كحد أقصى"),
  })
  .strict();

async function ownProducer(user: SessionUser) {
  const row = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 AND status NOT IN ('suspended','rejected')",
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(403, "مناطق التوصيل للأسر المنتجة المسجلة فقط");
  return row.id as string;
}

export async function ownZones(user: SessionUser): Promise<Zone[]> {
  const producerId = await ownProducer(user);
  return (
    await db().query(
      "SELECT id,name,fee::float8 AS fee,points FROM jdatna.producer_zones WHERE producer_id=$1 ORDER BY position,id",
      [producerId],
    )
  ).rows;
}

/** يستبدل مناطق الأسرة كلها دفعة واحدة. */
export async function saveZones(user: SessionUser, input: unknown) {
  const producerId = await ownProducer(user);
  const { zones } = zonesSchema.parse(input);
  await transaction(async (client) => {
    await client.query(
      "SELECT 1 FROM jdatna.producer_profiles WHERE id=$1 FOR UPDATE",
      [producerId],
    );
    await client.query(
      "DELETE FROM jdatna.producer_zones WHERE producer_id=$1",
      [producerId],
    );
    for (const [position, zone] of zones.entries())
      await client.query(
        "INSERT INTO jdatna.producer_zones(id,producer_id,position,name,fee,points) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          producerId,
          position,
          zone.name,
          zone.fee ?? null,
          JSON.stringify(zone.points),
        ],
      );
  });
  return { zones: zones.length };
}

/**
 * هل موقع العضو ضمن مناطق توصيل أسرة معتمدة؟ يعيد المنطقة الأقل رسومًا
 * عند التداخل. لا يُخزَّن الموقع ولا تُكشف حدود المناطق.
 */
export async function checkLocation(input: unknown) {
  const { producer, lat, lng } = z
    .object({
      producer: z.string().min(1).max(200),
      lat: z.number().finite(),
      lng: z.number().finite(),
    })
    .strict()
    .parse(input);
  if (!inSaudiBounds([lat, lng]))
    throw new HttpError(400, "الموقع المختار خارج المملكة");
  const zones = (
    await db().query(
      `SELECT z.name,z.fee::float8 AS fee,z.points FROM jdatna.producer_zones z
       JOIN jdatna.producer_profiles p ON p.id=z.producer_id
       WHERE p.slug=$1 AND p.status='approved'`,
      [producer],
    )
  ).rows as Omit<Zone, "id">[];
  const hits = zones
    .filter((zone) => pointInPolygon([lat, lng], zone.points))
    .sort((a, b) => (a.fee ?? 0) - (b.fee ?? 0));
  return hits.length
    ? { covered: true, hasZones: true, zone: hits[0].name, fee: hits[0].fee }
    : { covered: false, hasZones: zones.length > 0 };
}
