import { test, expect } from "@playwright/test";
test("mobile navigation closes after selection, same-route selection, outside click and Escape", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile interaction");
  await page.goto("/");
  const menu = page.locator(".mobile-nav");
  const toggle = menu.locator(":scope > summary");
  await toggle.click();
  await expect(menu).toHaveAttribute("open", "");
  await menu.getByRole("link", { name: "الأسر المنتجة", exact: true }).click();
  await expect(page).toHaveURL(/\/producers$/);
  await expect(menu).not.toHaveAttribute("open", "");
  await toggle.click();
  await menu.getByRole("link", { name: "الأسر المنتجة", exact: true }).click();
  await expect(menu).not.toHaveAttribute("open", "");
  await toggle.click();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator(".about-ticker-window").click();
  await expect(menu).not.toHaveAttribute("open", "");
  // أول القائمة: الألوان والقوالب، ثم مشاركة التطبيق، والرأس بلا أزرارهما (قرار المالك 2026-11-27).
  await expect(page.locator(".site-header > .appearance")).toBeHidden();
  await expect(page.locator(".site-header > .header-share")).toBeHidden();
  await toggle.click();
  const tools = menu.locator(".menu-tools");
  await expect(
    tools.getByRole("button", { name: "ألوان الموقع" }),
  ).toBeVisible();
  await expect(tools).toContainText("الألوان والقوالب");
  await expect(tools.locator(".menu-share > summary")).toContainText(
    "مشاركة التطبيق",
  );
  const first = await tools.boundingBox();
  const home = await menu.getByRole("link", { name: "الرئيسية" }).boundingBox();
  expect(first!.y).toBeLessThan(home!.y);
});
