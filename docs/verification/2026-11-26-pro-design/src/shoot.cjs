// يصوّر الرئيسية ومكتبة الموائد السبع من الصفحة الحقيقية (قاعدة اختبار معزولة) على 390 و1280.
// التشغيل: node shoot.cjs [slug]  — الخادم على 127.0.0.1:3000 والقالب المبسّط عبر الكوكي.
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../../../node_modules/playwright"));
const sharp = require(path.resolve(__dirname, "../../../../node_modules/sharp"));
const out = path.join(__dirname, "..");
const slug = process.argv[2] || "umm-salem";
const cloths = ["sadu", "abyad", "nahas", "khoos", "qatt", "zal", "tabliya"];
(async () => {
  const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 }, deviceScaleFactor: w === 390 ? 2 : 1 });
    await ctx.addCookies([{ name: "jdatna_template", value: "simple", url: "http://127.0.0.1:3000" }]);
    const p = await ctx.newPage();
    await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
    await p.screenshot({ path: path.join(out, `home-${w}.webp`) });
    // للقطات العنصر فقط: القائمة السفلية الثابتة ومؤشر التطوير لا يغطيان المائدة.
    const hide = () => p.addStyleTag({ content: ".bottom-nav,nextjs-portal{display:none!important}" });
    await hide();
    await p.locator(".maeda").screenshot({ path: path.join(out, `home-table-${w}.webp`) });
    await p.goto(`http://127.0.0.1:3000/producers/${slug}`, { waitUntil: "networkidle" });
    await hide();
    const shots = [];
    for (const c of cloths) {
      await p.evaluate((x) => document.querySelector(".family-maeda .maeda").setAttribute("data-cloth", x), c);
      await p.waitForTimeout(150);
      const f = path.join(out, `table-${c}-${w}.webp`);
      await p.locator(".family-maeda .maeda").screenshot({ path: f });
      shots.push(f);
    }
    // لوحة مقارنة: صفّان على 390، وعمود على 1280.
    const imgs = await Promise.all(shots.map((f) => sharp(f).resize(w === 390 ? 390 : 900).png().toBuffer({ resolveWithObject: true })));
    const cw = imgs[0].info.width, ch = Math.max(...imgs.map((i) => i.info.height));
    const cols = w === 390 ? 4 : 2, rows = Math.ceil(imgs.length / cols);
    await sharp({ create: { width: cols * (cw + 16) + 16, height: rows * (ch + 16) + 16, channels: 3, background: "#e8dcc6" } })
      .composite(imgs.map((i, n) => ({ input: i.data, left: 16 + (n % cols) * (cw + 16), top: 16 + Math.floor(n / cols) * (ch + 16) })))
      .webp({ quality: 82 }).toFile(path.join(out, `library-${w}.webp`));
    await ctx.close();
  }
  await b.close();
})();
