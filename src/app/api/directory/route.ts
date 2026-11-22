import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import { addToDirectory, inDirectory, listDirectory } from "@/server/directory";
/** «دليلي»: قائمة صاحبه وحده. ?producer=slug أو ?courier=id يسأل: هل هو في الدليل؟ */
export const GET = api(async (request) => {
  const user = await requireUser(request);
  const q = new URL(request.url).searchParams;
  if (q.has("producer") || q.has("courier") || q.has("customer"))
    return json({
      id: await inDirectory(user, {
        producer: q.get("producer") ?? undefined,
        courier: q.get("courier") ?? undefined,
        customer: q.get("customer") ?? undefined,
      }),
    });
  return json({ entries: await listDirectory(user) });
});
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("directory:" + user.id, 120, 3600);
  return json(await addToDirectory(user, await jsonBody(request)));
}, true);
