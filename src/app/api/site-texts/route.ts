import { api, json } from "@/server/http";
import { getSiteTexts } from "@/server/settings";
// نصوص الموقع للواجهات التي تُرسم في المتصفح (عامة أصلًا: تظهر في الصفحات).
export const GET = api(async () => json({ texts: await getSiteTexts() }));
