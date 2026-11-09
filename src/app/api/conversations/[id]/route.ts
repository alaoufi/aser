import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import { conversationMessages, sendMessage } from "@/server/chat";
type Context = { params: Promise<{ id: string }> };
export const GET = api(async (request, context: Context) => {
  const user = await requireUser(request);
  const after = new URL(request.url).searchParams.get("after") ?? undefined;
  return json(
    await conversationMessages(user, (await context.params).id, after),
  );
});
export const POST = api(async (request, context: Context) => {
  const user = await requireUser(request);
  await rateLimit("chat-send:" + user.id, 120, 3600);
  return json(
    await sendMessage(user, (await context.params).id, await jsonBody(request)),
    201,
  );
}, true);
