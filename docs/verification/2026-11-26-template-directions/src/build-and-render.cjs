// يبني صفحات النماذج الثلاثة ويرسمها صورًا (390 للجوال). التشغيل: node build-and-render.cjs
const fs = require("fs"), path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../../../node_modules/playwright"));
const icons = fs.readFileSync(path.join(__dirname, "icons.html"), "utf8");
const OUT = path.resolve(__dirname, "..");
const dirs = { "a-maeda": "أ — المائدة", "b-qaws": "ب — القوس", "c-souq": "ج — سوق الحي" };
(async () => {
  const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  for (const [key, title] of Object.entries(dirs)) {
    const body = fs.readFileSync(path.join(__dirname, `${key}.body.html`), "utf8");
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="base.css"></head><body data-screen="home">${icons}${body}<span class="mock-note">نموذج اتجاه ${title} — أسماء وأسعار توضيحية</span></body></html>`;
    const file = path.join(__dirname, `${key}.html`);
    fs.writeFileSync(file, html);
    for (const screen of ["home", "family"]) {
      const widths = process.env.WIDTHS ? process.env.WIDTHS.split(",").map(Number) : [390];
      for (const w of widths) {
        const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
        const p = await ctx.newPage();
        await p.goto("file://" + file);
        await p.evaluate((s) => (document.body.dataset.screen = s), screen);
        await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(OUT, `${key}-${screen}-${w}.png`), fullPage: true });
        await ctx.close();
      }
    }
  }
  await b.close();
})();
