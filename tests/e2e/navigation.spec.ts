import { test, expect } from "@playwright/test";
test("mobile navigation closes after selection, same-route selection, outside click and Escape", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "Mobile interaction");
  await page.goto("/");
  const menu = page.locator(".mobile-nav");
  const toggle = menu.locator("summary");
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
});
