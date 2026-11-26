// «صانع المائدة»: يصوّر 12 تركيبة (شكل × خامة × لون × حافة × مفرش) على صفحة أسرة حقيقية (قاعدة اختبار معزولة).
// التشغيل: node maker.cjs [slug] — الخادم على 127.0.0.1:3000.
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../../../node_modules/playwright"));
const sharp = require(path.resolve(__dirname, "../../../../node_modules/sharp"));
const out = path.join(__dirname, "..");
const slug = process.argv[2] || "umm-salem";
const C = { qahwa: "#6b4226", zaytooni: "#4f5d36", annabi: "#7d1a16", kohli: "#1f2a44", ramli: "#c9a46a" };
const combos = [
  ["مستطيل · سدو · قهوة", "rect", "sadu", C.qahwa, "", ""],
  ["بيضاوي · نحاس · حافة ذهبية", "oval", "brass", C.qahwa, "gold", ""],
  ["دائري · رخام · حافة ذهبية", "round", "marble", C.zaytooni, "gold", ""],
  ["سفرة أرضية · خشب · مع مفرش", "sufra", "wood", C.qahwa, "", "on"],
  ["مستطيل · مطرّز · عنابي", "rect", "embroidered", C.annabi, "", ""],
  ["مربع · نقش نجدي · كحلي · حافة مزدوجة", "square", "najdi", C.kohli, "double", ""],
  ["دائري · سادة زيتوني · حافة سدو", "round", "plain", C.zaytooni, "sadu", ""],
  ["سفرة أرضية · سدو · عنابي", "sufra", "sadu", C.annabi, "", ""],
  ["بيضاوي · خوص · مع مفرش", "oval", "khoos", C.annabi, "", "on"],
  ["مستطيل · سادة رملي · مفرش وحافة", "rect", "plain", C.ramli, "double", "on"],
  ["مربع · خشب زيتوني · حافة سدو", "square", "wood", C.zaytooni, "sadu", ""],
  ["سفرة أرضية · نقش نجدي · عنابي · ذهبية", "sufra", "najdi", C.annabi, "gold", ""],
];
(async () => {
  const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  for (const [w, pick] of [[390, combos], [1280, combos.filter((_, i) => [0, 1, 3, 5, 6, 9].includes(i))]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: w === 390 ? 2 : 1 });
    await ctx.addCookies([{ name: "jdatna_template", value: "simple", url: "http://127.0.0.1:3000" }]);
    const p = await ctx.newPage();
    await p.goto(`http://127.0.0.1:3000/producers/${slug}`, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: ".bottom-nav,nextjs-portal{display:none!important}" });
    const bufs = [];
    for (const [label, shape, finish, tc, edge, runner] of pick) {
      await p.evaluate(([label, shape, finish, tc, edge, runner]) => {
        const m = document.querySelector(".family-maeda .maeda");
        m.removeAttribute("data-cloth");
        Object.entries({ shape, finish, edge, runner }).forEach(([k, v]) => (v ? m.setAttribute(`data-${k}`, v) : m.removeAttribute(`data-${k}`)));
        m.style.setProperty("--tc", tc);
        m.querySelector(".maeda-hint").textContent = label;
      }, [label, shape, finish, tc, edge, runner]);
      await p.waitForTimeout(120);
      bufs.push(await p.locator(".family-maeda .maeda").screenshot());
    }
    const cw = w === 390 ? 390 : 900;
    const imgs = await Promise.all(bufs.map((x) => sharp(x).resize(cw).png().toBuffer({ resolveWithObject: true })));
    const ch = Math.max(...imgs.map((i) => i.info.height));
    const cols = w === 390 ? 4 : 2, rows = Math.ceil(imgs.length / cols);
    await sharp({ create: { width: cols * (cw + 16) + 16, height: rows * (ch + 16) + 16, channels: 3, background: "#e8dcc6" } })
      .composite(imgs.map((i, n) => ({ input: i.data, left: 16 + (n % cols) * (cw + 16), top: 16 + Math.floor(n / cols) * (ch + 16) })))
      .webp({ quality: 80 }).toFile(path.join(out, `maker-${w}.webp`));
    await ctx.close();
  }
  await b.close();
})();
