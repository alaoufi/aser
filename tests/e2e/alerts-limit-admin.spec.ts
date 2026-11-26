import { expect, test } from "@playwright/test";

/** «تطبيق الجوال ← تنبيهات الأسرة»: المدير يغيّر الحد اليومي (الافتراضي 10). واجهة فقط بخادم محاكى. */
test("the admin changes the family alerts daily limit", async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "a", name: "مدير", phone: "+966500000009", role: "admin" },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({ json: { summary: {} } }),
  );
  await page.route("**/api/admin/app-links", (r) =>
    r.fulfill({
      json: {
        links: {
          androidPackage: "",
          androidFingerprints: [],
          iosAppIds: [],
          showAppStore: true,
          showPlayStore: false,
        },
      },
    }),
  );
  let dailyLimit = 10;
  const sent: unknown[] = [];
  await page.route("**/api/admin/alerts-settings", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      sent.push(body);
      dailyLimit = body.dailyLimit;
    }
    return r.fulfill({ json: { dailyLimit } });
  });
  await page.goto("/admin/app");
  const box = page.getByRole("region", { name: "تنبيهات الأسرة" });
  const field = box.getByRole("spinbutton", { name: /الحد اليومي لكل عضو/ });
  await expect(field).toHaveValue("10");
  await field.fill("5");
  await box.getByRole("button", { name: "حفظ الحد" }).click();
  await expect.poll(() => sent).toEqual([{ dailyLimit: 5 }]);
  await expect(field).toHaveValue("5");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
