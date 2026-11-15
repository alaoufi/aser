import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { requireUser } from "@/server/auth";
import { reviewProducer } from "@/server/management";
import { pingIndexNow } from "@/server/indexnow";
import { db } from "@/server/db";
export const POST = api(async (request, context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  const producerId = z.uuid().parse(id);
  const result = await reviewProducer(
    user,
    producerId,
    await jsonBody(request),
  );
  // اعتماد الأسرة: صفحتها تُبلَّغ لمحركات البحث فورًا.
  if (result.status === "approved") {
    const row = (
      await db().query(
        "SELECT slug FROM jdatna.producer_profiles WHERE id=$1 AND NOT review_only",
        [producerId],
      )
    ).rows[0];
    if (row) pingIndexNow([`/producers/${row.slug}`, "/producers"]);
  }
  return json(result);
}, true);
