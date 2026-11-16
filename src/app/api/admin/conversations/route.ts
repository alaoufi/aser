import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminDeletedConversations } from "@/server/chat";
/** الإدارة ← «المحادثات المحذوفة». */
export const GET = api(async (request) =>
  json({
    conversations: await adminDeletedConversations(await requireUser(request)),
  }),
);
