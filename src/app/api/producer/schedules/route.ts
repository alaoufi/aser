import { api, json, jsonBody } from "@/server/http";
import { requireUser, rateLimit } from "@/server/auth";
import {
  addSchedule,
  mySchedules,
  removeSchedule,
} from "@/server/family-alerts";
/** «جدول التوزيع» للأسرة، ومعه عدد متابعي تنبيهاتها فقط (لا هوياتهم). */
export const GET = api(async (request) =>
  json(await mySchedules(await requireUser(request, ["producer", "admin"]))),
);
export const POST = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("schedules:" + user.id, 60, 3600);
  return json(await addSchedule(user, await jsonBody(request)));
}, true);
export const DELETE = api(async (request) => {
  const user = await requireUser(request, ["producer", "admin"]);
  await rateLimit("schedules:" + user.id, 60, 3600);
  return json(await removeSchedule(user, await jsonBody(request)));
}, true);
