import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";

/** اهتمامات العضو: أقسام أكلات يختارها بنفسه، فيعمل «مشابه لطلباتي» قبل أول طلب. */
const schema = z.object({
  categories: z.array(z.string().trim().min(1).max(40)).max(30),
});
export async function getInterests(user: SessionUser) {
  return (
    await db().query<{ id: string }>(
      "SELECT category_id AS id FROM jdatna.member_interests WHERE user_id=$1 ORDER BY category_id",
      [user.id],
    )
  ).rows.map((r) => r.id);
}
export async function saveInterests(user: SessionUser, input: unknown) {
  const wanted = [...new Set(schema.parse(input).categories)];
  return transaction(async (c) => {
    await c.query("SELECT id FROM jdatna.users WHERE id=$1 FOR UPDATE", [
      user.id,
    ]);
    // الأقسام المعروفة الظاهرة فقط؛ المجهول يُترك بصمت.
    const known = (
      await c.query<{ id: string }>(
        "SELECT id FROM jdatna.categories WHERE id=ANY($1::text[]) AND NOT hidden",
        [wanted],
      )
    ).rows.map((r) => r.id);
    await c.query("DELETE FROM jdatna.member_interests WHERE user_id=$1", [
      user.id,
    ]);
    if (known.length)
      await c.query(
        "INSERT INTO jdatna.member_interests(user_id,category_id) SELECT $1,unnest($2::text[])",
        [user.id, known],
      );
    return { categories: known.sort() };
  });
}
