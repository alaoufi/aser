import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
export const riyadhTodaySql =
  "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Riyadh')::date";
export const notCookingTodaySql = (alias = "p") =>
  `EXISTS(SELECT 1 FROM jdatna.producer_cooking_days cd WHERE cd.producer_id=${alias}.id AND cd.day=${riyadhTodaySql})`;
export function riyadhDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const cookingAvailabilitySchema = z
  .object({ notCookingToday: z.boolean() })
  .strict();
export function assertCookingStart(
  closed: boolean,
  startDate: string,
  today = riyadhDate(),
) {
  if (closed && startDate === today)
    throw new HttpError(
      409,
      "لا يوجد طبخ اليوم لدى هذه الأسرة؛ اختر بداية من الغد",
    );
}
export async function ownCookingAvailability(user: SessionUser) {
  const row = (
    await db().query(
      `SELECT ${riyadhTodaySql}::text AS day,${notCookingTodaySql()} AS "notCookingToday" FROM jdatna.producer_profiles p WHERE p.user_id=$1`,
      [user.id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "أنشئ ملف الأسرة أولًا");
  return row as { day: string; notCookingToday: boolean };
}
export async function saveCookingAvailability(
  user: SessionUser,
  input: unknown,
) {
  const value = cookingAvailabilitySchema.parse(input);
  return transaction(async (client) => {
    // Same family lock as order submission makes closure and today's order acceptance serial.
    const producer = (
      await client.query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "أنشئ ملف الأسرة أولًا");
    const day = (await client.query(`SELECT ${riyadhTodaySql}::text AS day`))
      .rows[0].day as string;
    if (value.notCookingToday)
      await client.query(
        "INSERT INTO jdatna.producer_cooking_days(producer_id,day) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [producer.id, day],
      );
    else
      await client.query(
        "DELETE FROM jdatna.producer_cooking_days WHERE producer_id=$1 AND day=$2",
        [producer.id, day],
      );
    return { day, notCookingToday: value.notCookingToday };
  });
}
