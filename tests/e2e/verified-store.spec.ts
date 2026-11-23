import { test, expect } from "@playwright/test";

/** شارة «متجر موثّق» في التذييل: رقم الشهادة، وتفتح صفحة الاستعلام الرسمية في تبويب جديد. */
test("the footer shows the verified-store badge with the certificate number", async ({
  page,
}) => {
  await page.goto("/");
  const badge = page.getByRole("link", {
    name: "متجر موثّق في المركز السعودي للأعمال، رقم الشهادة 0000346762",
  });
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("0000346762");
  await expect(badge).toHaveAttribute(
    "href",
    "https://eauthenticate.saudibusiness.gov.sa/inquiry",
  );
  await expect(badge).toHaveAttribute("target", "_blank");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await badge.scrollIntoViewIfNeeded();
  if (process.env.SHOTS)
    await page.locator(".footer-brand-col").screenshot({
      path: `${process.env.SHOTS}/verified-${test.info().project.name}.png`,
    });
});
