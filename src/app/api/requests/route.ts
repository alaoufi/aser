import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import {
  createCustomerRequest,
  myCustomerRequests,
  openCustomerRequests,
} from "@/server/customer-requests";
import { memberScope, parseMine } from "@/server/member-scope";
/**
 * «طلبات العملاء»: ?scope=open للأسر (مع ?mine=area,similar)، وبدونه طلبات العضو نفسه.
 */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const q = new URL(request.url).searchParams;
  if (q.get("scope") !== "open")
    return json({ requests: await myCustomerRequests(user) });
  const scope = await memberScope(user, parseMine(q.get("mine") ?? ""));
  return json({
    requests: await openCustomerRequests(user, {
      region: scope.filters?.region ?? null,
      categories: scope.filters?.categories ?? null,
    }),
    summary: scope.summary,
  });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("customer-request:" + user.id, 10, 3600);
  return json(await createCustomerRequest(user, await jsonBody(request)));
}, true);
