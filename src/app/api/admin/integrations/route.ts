import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { integrations } from "@/server/integrations";
/** «تكاملات API»: مربوطة أو لا فقط، بلا أي مفتاح. للمدير الكامل. */
export const GET = api(async (request) =>
  json({ items: await integrations(await requireUser(request)) }),
);
