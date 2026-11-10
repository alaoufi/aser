import { api, json } from "@/server/http";
import { pushPublicKey } from "@/server/push";
/** المفتاح العام لإشعارات الجوال، ليشترك به المتصفح. */
export const GET = api(async () => json({ publicKey: await pushPublicKey() }));
