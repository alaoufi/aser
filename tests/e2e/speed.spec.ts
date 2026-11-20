import { test, expect } from "@playwright/test";

// سرعة الفتح (5.33.1.0): ملفات public تُخزَّن في المتصفح بدل السؤال عنها في كل صفحة.
test("fonts and brand images are cached by the browser", async ({
  request,
}) => {
  const font = await request.get("/fonts/noto-sans-arabic-arabic.woff2");
  expect(font.ok()).toBe(true);
  expect(font.headers()["cache-control"]).toBe(
    "public, max-age=31536000, immutable",
  );
  for (const path of [
    "/brand/jdatna-symbol.webp",
    "/food/rice-plate-floating-v2.webp",
    "/guide/register-1.webp",
  ]) {
    const image = await request.get(path);
    expect(image.ok(), path).toBe(true);
    expect(image.headers()["cache-control"], path).toBe(
      "public, max-age=2592000, stale-while-revalidate=31536000",
    );
  }
  // صفحات الموقع نفسها لا تُخزَّن: التعديلات تظهر فورًا.
  const home = await request.get("/");
  expect(home.headers()["cache-control"]).toContain("no-store");
});

// صورة الطبق تُطلب بمقاس ما يُعرض (نحو نصف عرض الجوال) لا بعرض الشاشة كله.
test("the home dish image asks for the size it is shown at", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto("/");
  const dish = page.locator(".food-showcase-main img");
  await expect(dish).toHaveAttribute("sizes", /55vw/);
  const box = await dish.boundingBox();
  expect(box?.width).toBeLessThan(412 * 0.6);
});

// غلاف دليل التسجيل يعرض الشعار المصغّر (12 ك.ب) لا الملف الكامل (202 ك.ب).
test("the guide cover uses the small logo", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/guide");
  await expect(
    page.locator('img[src="/brand/jdatna-main-264.webp"]'),
  ).toBeVisible();
  expect(requested).not.toContain("/brand/jdatna-main.webp");
});

// عند فتح المحادثات من جديد والحساب معروف في الجهاز: قائمة المحادثات تُطلب مرة واحدة،
// وتبدأ قبل وصول رد الجلسة.
test("a fresh open of messages loads the list once without waiting for the session", async ({
  page,
}) => {
  const user = {
    id: "u1",
    name: "عميل",
    phone: "+966500000071",
    role: "customer",
  };
  await page.addInitScript((u) => {
    localStorage.setItem(
      "jdatna:session",
      JSON.stringify({ user: u, registrationOpen: true, savedAt: Date.now() }),
    );
  }, user);
  let sessionAnswered = false;
  let listBeforeSession = false;
  let lists = 0;
  await page.route("**/api/session", async (r) => {
    await new Promise((done) => setTimeout(done, 700));
    sessionAnswered = true;
    await r.fulfill({ json: { user, registrationOpen: true } });
  });
  await page.route("**/api/conversations", (r) => {
    lists += 1;
    if (!sessionAnswered) listBeforeSession = true;
    return r.fulfill({ json: { conversations: [] } });
  });
  await page.goto("/messages");
  await expect.poll(() => sessionAnswered).toBe(true);
  await page.waitForTimeout(500);
  expect(listBeforeSession).toBe(true);
  expect(lists).toBe(1);
});

// جلسة محفوظة أقدم من 30 يومًا لا تُعتمد: يُنتظر رد الخادم.
test("an old saved session is ignored", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "jdatna:session",
      JSON.stringify({
        user: {
          id: "u1",
          name: "قديم",
          phone: "+966500000071",
          role: "customer",
        },
        registrationOpen: true,
        savedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
      }),
    );
  });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.goto("/me");
  await expect(
    page.locator("main").getByRole("link", { name: "تسجيل الدخول" }),
  ).toBeVisible();
  await expect(page.getByText("قديم")).toHaveCount(0);
});
