import { cleanupAuthRows } from "../src/server/auth-maintenance";
import { db } from "../src/server/db";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const arg = process.argv[2];
  const batch = arg === undefined ? 1000 : Number(arg);
  const removed = await cleanupAuthRows(batch);
  // تنبيه الإدارة بالأسر التي تأخرت في المستندات (لا يُفشل الصيانة إن تعذر).
  let lateDocuments = 0;
  try {
    const { notifyLateDocuments } = await import("../src/server/management");
    lateDocuments = await notifyLateDocuments();
  } catch {}
  // بصمات فتح روابط الدعوة تُحذف بعد يوم (قرار المالك 2026-11-27).
  let inviteClicks = 0;
  try {
    const { cleanupInviteClicks } = await import("../src/server/referrals");
    inviteClicks = (await cleanupInviteClicks()) ?? 0;
  } catch {}
  console.log(
    JSON.stringify({
      removed,
      batchPerTable: batch,
      lateDocuments,
      inviteClicks,
    }),
  );
}
main()
  .catch((error) => {
    console.error("Authentication maintenance failed", {
      code:
        error && typeof error === "object" && "code" in error
          ? error.code
          : "configuration_or_runtime_error",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) await db().end();
  });
