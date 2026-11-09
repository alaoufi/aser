import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { listConversations, startConversation } from "@/server/chat";
export const GET = api(async (request) =>
  json({ conversations: await listConversations(await requireUser(request)) }),
);
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("chat-start:" + user.id, 30, 3600);
  return json(await startConversation(user, await jsonBody(request)), 201);
}, true);
