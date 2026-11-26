import { dispatchFamilyAlerts } from "../src/server/family-alerts";
import { db } from "../src/server/db";
/** تشغيل يدوي أو مجدول لدورة «تنبيهات الأسرة» (الخادم يشغّلها كل خمس دقائق تلقائيًا). */
const result = await dispatchFamilyAlerts();
console.log(
  JSON.stringify({ sent: result.sent, suppressed: result.suppressed }),
);
await db().end();
