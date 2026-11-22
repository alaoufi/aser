/**
 * يبلّغ IndexNow (Bing وYandex وNaver وSeznam وغيرها) بكل روابط خريطة الموقع على العنوان الأساسي.
 * يُشغَّل يدويًا بعد نشر تغيير كبير، مثل نقل الموقع إلى jdtna.sa:  npx tsx scripts/indexnow-sitemap.ts
 * المفتاح عام بطبيعة البروتوكول (ملفه في public/)، فلا سر هنا.
 */
import { SITE_URL } from "../src/lib/seo";
import { INDEXNOW_KEY } from "../src/server/indexnow";

async function main() {
  const host = new URL(SITE_URL).host;
  const key = await fetch(`${SITE_URL}/${INDEXNOW_KEY}.txt`);
  if (!key.ok || (await key.text()).trim() !== INDEXNOW_KEY)
    throw new Error(`ملف المفتاح لا يعمل على ${SITE_URL}`);
  const xml = await (await fetch(`${SITE_URL}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((u) => new URL(u).host === host);
  if (!urls.length)
    throw new Error("خريطة الموقع بلا روابط على العنوان الأساسي");
  // البروتوكول يقبل حتى 10000 رابط في الطلب الواحد.
  for (let i = 0; i < urls.length; i += 10000) {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(i, i + 10000),
      }),
    });
    console.log(
      `IndexNow: ${urls.slice(i, i + 10000).length} رابط ← ${res.status} ${res.statusText}`,
    );
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
