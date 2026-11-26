// يرسم أشكال المائدة الأربعة (390) ولوحة مقارنة. التشغيل: node render.cjs
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../../../node_modules/playwright"));
const sharp = require(path.resolve(__dirname, "../../../../node_modules/sharp"));
(async () => {
  const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const files = [];
  for (const v of ["sadu", "abyad", "nahas", "khoos"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 640 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.goto("file://" + path.join(__dirname, "tables.built.html"));
    await p.evaluate((x) => (document.body.dataset.v = x), v);
    await p.waitForTimeout(300);
    const f = path.join(__dirname, "..", `table-${v}-390.png`);
    await p.screenshot({ path: f, fullPage: true });
    files.push(f);
    await ctx.close();
  }
  await b.close();
  const imgs = await Promise.all(files.map((f) => sharp(f).resize(390).toBuffer({ resolveWithObject: true })));
  const h = Math.max(...imgs.map((i) => i.info.height));
  await sharp({ create: { width: 390 * 4 + 60, height: h + 20, channels: 3, background: "#e8dcc6" } })
    .composite(imgs.map((i, n) => ({ input: i.data, left: 10 + n * 400, top: 10 })))
    .png().toFile(path.join(__dirname, "..", "tables-compare.png"));
})();
