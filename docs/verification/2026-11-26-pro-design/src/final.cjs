// الصور النهائية لاعتماد المالك: الرئيسية، وصفحة أسرة بمائدتها المحفوظة، و«مائدتي» في لوحة الأسرة،
// و«خيارات المائدة» في الإدارة؛ على 390 و1280. قاعدة اختبار معزولة، وجلسة اللوحتين محاكاة.
const path = require("path");
const { chromium } = require(path.resolve(__dirname, "../../../../node_modules/playwright"));
const out = path.join(__dirname, "..", "final");
const B = "http://127.0.0.1:3000";
const hide = ".bottom-nav,nextjs-portal{display:none!important}";
(async () => {
  require("fs").mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  for (const w of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w === 390 ? 844 : 900 }, deviceScaleFactor: w === 390 ? 2 : 1 });
    await ctx.addCookies([{ name: "jdatna_template", value: "simple", url: B }]);
    await ctx.addInitScript(() => { try { sessionStorage.setItem("jdatna:family-welcome", "1"); } catch {} });
    const p = await ctx.newPage();
    const shot = async (name, full = true) => p.screenshot({ path: path.join(out, `${name}-${w}.png`), fullPage: full });
    await p.goto(B + "/", { waitUntil: "networkidle" });
    await shot("home", false);
    await p.goto(B + "/producers/umm-salem", { waitUntil: "networkidle" });
    await p.addStyleTag({ content: hide });
    await p.locator(".family-maeda").scrollIntoViewIfNeeded();
    await p.locator(".family-maeda").screenshot({ path: path.join(out, `family-${w}.png`) });
    // لوحة الأسرة: جلسة محاكاة، والمائدة المحفوظة (نحاس)، والرخام مخفي من الإدارة.
    await p.route("**/api/session", (r) => r.fulfill({ json: { user: { id: "00000000-0000-4000-8000-000000000021", name: "مطبخ أم سالم", phone: "+966500000021", role: "producer" }, registrationOpen: true } }));
    await p.route("**/api/producer/maeda", (r) => r.fulfill({ json: { name: "مطبخ أم سالم", style: { shape: "oval", finish: "brass", color: "qahwa", edge: "gold", runner: false }, hidden: ["finish:marble"] } }));
    await p.goto(B + "/dashboard/maeda", { waitUntil: "networkidle" });
    await p.addStyleTag({ content: hide });
    await shot("picker");
    await p.getByText("ركّب مائدتك بنفسك").click();
    await p.getByRole("group", { name: "الخامة" }).getByRole("radio", { name: "خشب" }).check();
    await p.getByRole("group", { name: "المفرش" }).getByRole("radio", { name: "بمفرش" }).check();
    await p.waitForTimeout(200);
    await shot("picker-build");
    await p.unroute("**/api/session");
    await p.route("**/api/session", (r) => r.fulfill({ json: { user: { id: "a", name: "المدير", phone: "+966500000009", role: "admin" }, registrationOpen: true } }));
    await p.route("**/api/admin/producers/pending", (r) => r.fulfill({ json: { count: 0 } }));
    await p.route("**/api/admin/menu-layout", (r) => r.fulfill({ json: { layout: null } }));
    await p.route("**/api/admin/settings", (r) => r.fulfill({ json: { template: "simple", templates: ["classic", "simple"], palette: "sadu", palettes: ["sadu"] } }));
    await p.route("**/api/admin/maeda", (r) => r.fulfill({ json: { hidden: ["finish:marble"], used: { "finish:brass": 3, "shape:oval": 3, "color:qahwa": 5, "edge:gold": 2 } } }));
    await p.goto(B + "/admin/template", { waitUntil: "networkidle" });
    await p.addStyleTag({ content: hide });
    const sec = p.getByRole("region", { name: "خيارات المائدة" });
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: path.join(out, `admin-${w}.png`) });
    await ctx.close();
  }
  await b.close();
})();
