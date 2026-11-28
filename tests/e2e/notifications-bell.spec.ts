import { test, expect } from "@playwright/test";

/**
 * جرس «الإشعارات» (2026-11-27) وترتيبه في رأس الجوال (ملاحظة المالك 2026-11-28):
 * ☰ في طرف، والجرس بجانبه، والشعار آخر الرأس في الطرف المقابل.
 */
test("the bell lists notifications and keeps the logo at the far end of the mobile header", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "c1",
          name: "عبدالله",
          phone: "+966500000001",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  let read: unknown;
  await page.route("**/api/notifications", (r) => {
    if (r.request().method() === "POST") {
      read = r.request().postDataJSON();
      return r.fulfill({ json: { items: [], unread: 0 } });
    }
    return r.fulfill({
      json: {
        unread: 2,
        items: [
          {
            id: "00000000-0000-4000-8000-000000000031",
            title: "رسالة جديدة من شعبيات الأولين",
            body: "طلبك جاهز",
            url: "/messages",
            createdAt: new Date().toISOString(),
            read: false,
          },
        ],
      },
    });
  });
  await page.goto("/");
  const bell = page.locator(".site-header > .notif-bell");
  await expect(bell.locator("summary")).toHaveAccessibleName(
    "الإشعارات، 2 غير مقروء",
  );
  if ((page.viewportSize()?.width ?? 1280) <= 850) {
    const box = async (sel: string) =>
      (await page.locator(sel).first().boundingBox())!;
    const menu = await box(".site-header > .mobile-nav");
    const ring = await box(".site-header > .notif-bell");
    const logo = await box(".site-header .brand-logo, .site-header .brand img");
    // ☰ أقصى اليمين، ثم الجرس، والشعار أقصى اليسار.
    expect(menu.x).toBeGreaterThan(ring.x);
    expect(ring.x).toBeGreaterThan(logo.x);
    expect(logo.x).toBeLessThan(40);
  }
  await bell.locator("summary").click();
  const panel = page.getByRole("dialog", { name: "الإشعارات" });
  await expect(panel).toContainText("رسالة جديدة من شعبيات الأولين");
  await panel.getByRole("button", { name: "تعليم الكل مقروءًا" }).click();
  await expect.poll(() => read).toEqual({ read: "all" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
