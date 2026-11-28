import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * «ادعُ صديقًا» برقم العضو: الرابط jdtna.sa/r/رقم العضو في «معلوماتي» مع الرصيد، ورقم العضو فوق الاسم،
 * ورابط الدعوة يفتح «حساب جديد» ويحفظ رقم من دعاه ليملأ خانة «رقم الدعوة» (اختياري).
 */
test.describe("invite a friend", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const host = randomUUID();
  const friend = randomUUID();
  const token = randomBytes(32).toString("hex");
  let code = "";
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'صاحب الدعوة',$2,'customer',now()),($3,'الصديق',$4,'customer',now())",
      [host, ph(), friend, ph()],
    );
    await pool.query(
      "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES(encode(sha256(convert_to($1,'UTF8')),'hex'),$2,now()+interval '1 hour')",
      [token, host],
    );
  });
  test.afterAll(async () => {
    await pool?.query("DELETE FROM jdatna.referrals WHERE referrer_id=$1", [
      host,
    ]);
    await pool?.query("DELETE FROM jdatna.sessions WHERE user_id=$1", [host]);
    await pool?.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
      [host, friend],
    ]);
    await pool?.end();
  });

  test("the profile shows the invite link and the balance", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await context.addCookies([
      { name: "jdatna_session", value: token, url: baseURL! },
    ]);
    await context.addInitScript(() =>
      sessionStorage.setItem("jdatna:push-later", "1"),
    );
    const no = (
      await pool!.query("SELECT member_no FROM jdatna.users WHERE id=$1", [
        host,
      ])
    ).rows[0].member_no as number;
    await page.goto("/me#invite");
    const box = page.getByRole("region", { name: "ادعُ صديقًا" });
    await expect(box.getByTestId("invite-balance")).toContainText("رصيدك: 0");
    const link = await box.getByLabel("رابط دعوتك").inputValue();
    expect(link).toBe(`https://jdtna.sa/r/${no}`);
    // مشاركة التطبيق في رأس الموقع (قرار المالك 2026-11-27): رابط العضو jdtna.sa/app/رقمه.
    // على الجوال في أول القائمة (قرار المالك 2026-11-27)، وعلى الكمبيوتر في الرأس.
    const mobile = info.project.name === "mobile";
    if (mobile) await page.locator(".mobile-nav > summary").click();
    const share = page.locator(mobile ? ".menu-share" : ".header-share");
    await share.locator("summary").click();
    await expect(share.locator(".share-link")).toHaveText(`jdtna.sa/app/${no}`);
    await expect(share.getByRole("link", { name: "واتساب" })).toHaveAttribute(
      "href",
      new RegExp(encodeURIComponent(`رقم الدعوة: ${no}`)),
    );
    await share.getByRole("button", { name: "رمز QR" }).click();
    await expect(share.locator(".share-qr img")).toHaveAttribute(
      "src",
      `/app/qr?r=${no}`,
    );
    await share.locator("summary").click();
    // رسالة الدعوة (طلب المالك 2026-11-26) ثم الرابط.
    await expect(box.getByRole("link", { name: "واتساب" })).toHaveAttribute(
      "href",
      `https://wa.me/?text=${encodeURIComponent(`نرحب بدعوتكم للانضمام في منصة #اكلات_جدتنا\nرقم الدعوة: ${no}\n${link}`)}`,
    );
    await expect(box).toContainText(`رقم دعوتك: ${no}`);
    code = String(no);
    // رقم العضو فوق الاسم في قائمة الجوال (☰) أيضًا.
    if (info.project.name === "mobile") {
      await page.locator('summary[aria-label="قائمة التنقل"]').click();
      await expect(page.locator(".menu-greeting .member-no")).toContainText(
        String(no),
      );
      await page.keyboard.press("Escape");
    }
    // رقم العضو فوق الاسم في قائمة الحساب.
    await expect(page.locator(".member-no").first()).toContainText(String(no));
    // صديق سجل عن طريقه: يزيد الرصيد.
    await pool!.query(
      "INSERT INTO jdatna.referrals(referred_id,referrer_id,via) VALUES($1,$2,'link')",
      [friend, host],
    );
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "ادعُ صديقًا" })
        .getByTestId("invite-balance"),
    ).toContainText("رصيدك: 1");
  });

  test("the invite link opens sign-up and remembers who invited", async ({
    page,
    context,
  }) => {
    test.skip(!code, "needs the code from the previous test");
    // التحويل نسبي (لا يكشف عنوان الخادم الداخلي خلف البوابة).
    const raw = await page.request.get(`/r/${code}`, { maxRedirects: 0 });
    expect(raw.status()).toBe(302);
    expect(raw.headers().location).toBe(`/invite/${code}`);
    // رابط مشاركة التطبيق برقم العضو كدعوة الصديق تمامًا.
    const app = await page.request.get(`/app/${code}`, { maxRedirects: 0 });
    expect(app.status()).toBe(302);
    expect(app.headers().location).toBe(`/invite/${code}`);
    expect(app.headers()["set-cookie"]).toContain(`jdatna_ref=${code}`);
    const qr = await page.request.get(`/app/qr?r=${code}`);
    expect(qr.headers()["content-type"]).toContain("image/svg+xml");
    // صفحة الدعوة القصيرة ثم التحويل حسب الجوال (قرار المالك 2026-11-27).
    // المتجران خارج الاختبار: يُعترض طلبهما ويُرد عليه هنا، فلا يُرسل شيء خارجيًا.
    await page.route(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//, (r) =>
      r.fulfill({ contentType: "text/html", body: "<p>store</p>" }),
    );
    // ما ينسخه زر الآيفون يُلتقط هنا (الحافظة الحقيقية خارج الاختبار).
    let copied = "";
    await page.exposeFunction("__copied", (t: string) => {
      copied = t;
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (t: string) =>
            (
              window as unknown as { __copied(t: string): Promise<void> }
            ).__copied(t),
        },
      });
    });
    await page.goto(`/r/${code}`);
    await expect(page).toHaveURL(new RegExp(`/invite/${code}$`));
    const landing = page.getByRole("region", {
      name: "دعاك صديقك إلى أكلات جدتنا",
    });
    await expect(landing).toContainText(`رقم الدعوة:${code}`);
    // على الجوال رابط «أكمل من الموقع» لمن لا يريد التطبيق؛ على الكمبيوتر التسجيل نفسه.
    const desktop = test.info().project.name === "desktop";
    await expect(
      landing.getByRole("link", {
        name: desktop ? "سجّل الآن" : "أكمل من الموقع بدل التطبيق",
      }),
    ).toHaveAttribute("href", "/login?signup=1");
    // الكمبيوتر إلى التسجيل تلقائيًا. الآيفون (مشروع الجوال): لا تحويل تلقائي، بل زر واحد ينسخ رابط
    // الدعوة ثم يفتح App Store، فيقرؤه التطبيق عند أول فتح (قرار المالك 2026-11-28).
    if (desktop)
      await expect(page).toHaveURL(/\/login\?signup=1/, { timeout: 8000 });
    else {
      await expect(landing).toContainText("نحفظ رقم الدعوة ثم نفتح App Store");
      await page.waitForTimeout(3000);
      await expect(page).toHaveURL(new RegExp(`/invite/${code}$`));
      await landing
        .getByRole("link", { name: "حمّل التطبيق من App Store" })
        .click();
      await expect(page).toHaveURL(
        /^https:\/\/apps\.apple\.com\/sa\/app\/id6833382132$/,
        { timeout: 8000 },
      );
      expect(copied).toMatch(new RegExp(`/r/${code}$`));
    }
    const saved = (await context.cookies()).find(
      (c) => c.name === "jdatna_ref",
    );
    expect(saved?.value).toBe(code);
    // رقم غير صحيح لا يُحفظ، ويفتح الرئيسية.
    await context.clearCookies();
    await page.goto("/r/zzzzzzz");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/r/9999998");
    await expect(page).toHaveURL(/\/$/);
    expect(
      (await context.cookies()).find((c) => c.name === "jdatna_ref"),
    ).toBeUndefined();
  });
});
