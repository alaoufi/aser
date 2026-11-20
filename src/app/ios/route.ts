import { APP_STORE_URL } from "@/server/settings";
/** رابط مختصر: jdatna.com/ios يفتح صفحة التطبيق في App Store. */
export function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: APP_STORE_URL,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
