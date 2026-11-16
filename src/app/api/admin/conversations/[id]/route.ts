import { api, json } from "@/server/http";
import { requireUser } from "@/server/auth";
import { adminDeletedTranscript } from "@/server/chat";
type Context = { params: Promise<{ id: string }> };
/** نص محادثة محذوفة (رقم سجل الحذف) كما كانت لحظة حذفها. */
export const GET = api(async (request, context: Context) =>
  json({
    messages: await adminDeletedTranscript(
      await requireUser(request),
      (await context.params).id,
    ),
  }),
);
