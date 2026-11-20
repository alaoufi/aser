import { PLAY_STORE_URL } from "@/server/settings";
/** رابط مختصر: jdatna.com/gl يفتح صفحة التطبيق في Google Play. */
export function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: PLAY_STORE_URL,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
