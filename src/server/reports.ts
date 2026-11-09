import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { transaction } from "./db";
import { HttpError } from "./security";
export const submissionSchema = z
  .object({
    productId: z.uuid().optional(),
    producerId: z.uuid().optional(),
    reason: z.string().trim().min(10).max(2000),
  })
  .refine((v) => Boolean(v.productId) !== Boolean(v.producerId), {
    message: "حدد منتجًا أو أسرة واحدة للبلاغ",
  });
export async function submitReport(user: SessionUser, input: unknown) {
  const value = submissionSchema.parse(input);
  return transaction(async (client) => {
    const target = value.productId
      ? (
          await client.query(
            "SELECT x.id FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id WHERE x.id=$1 AND x.visible=true AND p.status='approved'",
            [value.productId],
          )
        ).rows[0]
      : (
          await client.query(
            "SELECT id FROM jdatna.producer_profiles WHERE id=$1 AND status='approved'",
            [value.producerId],
          )
        ).rows[0];
    if (!target) throw new HttpError(404, "المنتج أو الأسرة المنتجة غير متاح");
    const id = randomUUID();
    await client.query(
      "INSERT INTO jdatna.reports(id,reporter_id,product_id,producer_id,reason) VALUES($1,$2,$3,$4,$5)",
      [
        id,
        user.id,
        value.productId ?? null,
        value.producerId ?? null,
        value.reason,
      ],
    );
    return { id };
  });
}
