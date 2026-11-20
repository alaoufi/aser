import { SITE_VERSION } from "@/lib/version";
import { apnsConfigured } from "@/server/apns";
import { db, databaseConfigured } from "@/server/db";
import {
  registrationOpen,
  storageConfigured,
  smsConfigured,
} from "@/server/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  let database = false;
  if (databaseConfigured()) {
    try {
      await db().query("SELECT 1 FROM jdatna.platform_settings LIMIT 1");
      database = true;
    } catch {}
  }
  return Response.json(
    {
      status: database ? "ready" : "not_ready",
      version: process.env.SOURCE_COMMIT || "local",
      release: SITE_VERSION,
      database,
      registrationOpen: registrationOpen() && database,
      smsConfigured: smsConfigured(),
      privateStorageConfigured: storageConfigured(),
      // مفتاح إشعارات تطبيق الآيفون (Apple) مضبوط على الخادم: نعم/لا فقط، بلا أي تفصيل.
      iphonePushConfigured: apnsConfigured(),
    },
    { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
