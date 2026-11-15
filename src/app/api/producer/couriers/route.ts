import { api, json, jsonBody } from "@/server/http";
import { rateLimit, requireUser } from "@/server/auth";
import {
  familyCouriers,
  saveFamilyCourier,
  stopFamilyCourier,
} from "@/server/couriers";
/** مندوبو الأسرة الخاصون: تسجّلهم الأسرة بتعهّدها دون اعتماد الإدارة، ويظهرون لها فقط. */
export const GET = api(async (request) =>
  json(await familyCouriers(await requireUser(request))),
);
export const POST = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("family-courier:" + user.id, 30, 3600);
  return json(await saveFamilyCourier(user, await jsonBody(request)));
}, true);
/** إيقاف المندوب الخاص. */
export const PATCH = api(async (request) => {
  const user = await requireUser(request);
  await rateLimit("family-courier:" + user.id, 30, 3600);
  return json(await stopFamilyCourier(user, await jsonBody(request)));
}, true);
