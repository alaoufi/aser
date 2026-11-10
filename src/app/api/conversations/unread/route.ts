import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { unreadConversations } from "@/server/chat";
/** عدد الرسائل غير المقروءة وأحدث محادثاتها، لتنبيه «لديك رسالة جديدة». */
export const GET = api(async (request) =>
  json(await unreadConversations(await requireUser(request))),
);
