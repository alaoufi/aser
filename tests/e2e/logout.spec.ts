import { test, expect } from "@playwright/test";

// آخر قائمة التنقل: «تسجيل الدخول» لغير المسجّل، و«خروج» للمسجّل.
test("the menu ends with login for visitors and logout for members", async ({
  page,
}) => {
  let user: Record<string, string> | null = null;
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  let loggedOut = false;
  await page.route("**/api/logout", (r) => {
    loggedOut = true;
    user = null;
    return r.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const open = () => page.getByLabel("قائمة التنقل").click();
  const menu = page.getByRole("navigation", { name: "التنقل للجوال" });
  await open();
  await expect(menu.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "خروج" })).toHaveCount(0);

  user = { id: "c", name: "عميل", phone: "+966500000071", role: "customer" };
  await page.route("**/api/orders", (r) => r.fulfill({ json: { orders: [] } }));
  await page.goto("/orders");
  // «خروج» في قائمة «حسابي» أيضًا.
  await expect(
    page
      .getByRole("navigation", { name: "حسابي", exact: true })
      .getByRole("button", { name: "خروج" }),
  ).toBeVisible();
  await open();
  const last = menu.locator("a, button").last();
  await expect(last).toHaveText("خروج");
  await last.click();
  await expect(page).toHaveURL(/\/$/);
  expect(loggedOut).toBe(true);
});
