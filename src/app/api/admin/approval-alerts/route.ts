import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { approvalAlertRecipients, setApprovalAlert } from "@/server/management";

/** «من يستقبل إشعارات الموافقات» (قرار المالك 2026-11-28): للمدير العام فقط. */
export const GET = api(async (request) =>
  json({
    recipients: await approvalAlertRecipients(await requireUser(request)),
  }),
);
export const POST = api(async (request) =>
  json(
    await setApprovalAlert(await requireUser(request), await request.json()),
  ),
);
