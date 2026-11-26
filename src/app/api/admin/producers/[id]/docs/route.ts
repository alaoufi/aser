import { z } from "zod";
import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { producerDocsAction } from "@/server/management";

/** مهلة مستندات الأسرة: تمديد، أو إخفاء المنتجات حتى رفعها، أو إظهارها (قرار المالك 2026-11-26). */
export const POST = api(async (request, context) => {
  const user = await requireUser(request);
  await rateLimit("admin-write:" + user.id, 300, 3600);
  const { id } = await context.params;
  return json(
    await producerDocsAction(user, z.uuid().parse(id), await jsonBody(request)),
  );
}, true);
