import { test, expect } from "@playwright/test";

test("the site installs as an app: manifest, icons and the notification worker are served", async ({
  page,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("أكلات جدتنا");
  expect(manifest.display).toBe("standalone");
  expect(manifest.dir).toBe("rtl");
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src);
    expect(r.ok()).toBe(true);
  }
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(await sw.text()).toContain("showNotification");
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration("/")),
      ),
    )
    .toBe(true);
});

test("a signed-in member is offered to enable notifications and can postpone it", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "m",
          name: "عضو",
          phone: "+966500000010",
          role: "customer",
          permissions: [],
        },
        registrationOpen: true,
      },
    }),
  );
  await page.goto("/");
  const permission = await page.evaluate(() => Notification.permission);
  test.skip(permission !== "default", "browser has no notification prompt");
  const bar = page.getByRole("complementary", { name: "فعّل الإشعارات" });
  await expect(bar).toBeVisible();
  await expect(
    bar.getByRole("button", { name: "تفعيل الإشعارات" }),
  ).toBeVisible();
  await bar.getByRole("button", { name: "لاحقًا" }).click();
  await expect(bar).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "فعّل الإشعارات" }),
  ).toHaveCount(0);
});

// انقطاع الاتصال: يظهر «نعيد الاتصال» من جدتنا بدل صفحة خطأ المتصفح، ويعود الموقع فور عودة الشبكة.
test("when the connection drops the app shows a branded retry page, then recovers", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return Boolean(navigator.serviceWorker.controller);
      }),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.goto("/browse").catch(() => {});
  await expect(page.getByText("تعذّر الاتصال الآن")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "أعد المحاولة" }),
  ).toBeVisible();
  // عودة الشبكة: تعود الصفحة المطلوبة تلقائيًا (أو بزر «أعد المحاولة»).
  await context.setOffline(false);
  await expect(page).toHaveURL(/\/browse/);
  // يعيد المحاولة تلقائيًا كل أربع ثوانٍ حتى يعود الاتصال.
  await expect(page.getByText("تعذّر الاتصال الآن")).toHaveCount(0, {
    timeout: 20000,
  });
});
