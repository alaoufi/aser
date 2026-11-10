import { test, expect } from "@playwright/test";

test("admin switches the site template between the Najdi door and the classic look", async ({
  page,
}) => {
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
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  let template = "najdi";
  const sent: unknown[] = [];
  await page.route("**/api/admin/settings", async (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON();
      sent.push(body);
      template = body.template;
    }
    return r.fulfill({ json: { template } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "قالب الموقع", exact: true }).click();
  const najdi = page.getByRole("radio", { name: /الباب النجدي/ });
  const classic = page.getByRole("radio", { name: /الكلاسيكي/ });
  await expect(najdi).toBeChecked();
  await classic.click();
  await expect(classic).toBeChecked();
  expect(sent).toEqual([{ template: "classic" }]);
  await expect(page.getByText("(المفعّل)")).toHaveCount(1);
});

test("the default template is the Najdi door with wooden windows on the home page", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  const t = await html.getAttribute("data-template");
  expect(["najdi", "classic"]).toContain(t);
  if (t === "najdi") {
    await expect(
      page.getByRole("img", { name: "باب نجدي خشبي يطل منه طبق أرز" }),
    ).toBeVisible();
    await expect(page.locator(".najdi-window")).toHaveCount(2);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
