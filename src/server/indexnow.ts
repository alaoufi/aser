import { SITE_URL } from "@/lib/seo";
/**
 * IndexNow: يبلّغ Bing وYandex ومحركات أخرى فور نشر منتج أو اعتماد أسرة، فتُفهرس الصفحة خلال ساعات.
 * المفتاح ليس سرًّا (البروتوكول ينشره في ملف عام: public/0372a8f0d3b342f0b55d61b3d5f092fb.txt).
 * يعمل في الإنتاج فقط، ولا يؤخّر الطلب ولا يُفشله إن تعذّر الإبلاغ.
 */
export const INDEXNOW_KEY = "0372a8f0d3b342f0b55d61b3d5f092fb";
export function pingIndexNow(paths: string[]) {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.INDEXNOW_DISABLED === "true" ||
    process.env.JDATNA_TEST_DB === "true" ||
    !paths.length
  )
    return;
  const host = new URL(SITE_URL).host;
  void fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList: paths.map((p) => new URL(p, SITE_URL).href),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
