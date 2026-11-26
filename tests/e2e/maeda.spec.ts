import { test, expect, type Page } from "@playwright/test";

/**
 * «صانع المائدة» (اعتماد المالك 2026-11-26): الأسرة تختار مائدة جاهزة أو تركّبها، والمعاينة تتغير
 * فورًا باسمها، والحفظ يرسل التركيبة، والخيار المخفي من الإدارة لا يظهر. والإدارة تخفي الخيارات.
 * الجلسة والخادم محاكيان (لا كتابة في أي قاعدة)؛ الحفظ الفعلي في tests/maeda.test.ts.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

async function asFamily(page: Page) {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "00000000-0000-4000-8000-000000000021",
          name: "مطبخ أم سالم",
          phone: "+966500000021",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
}

test("a family picks a ready table or builds one, previews it live with its name, and saves it", async ({
  page,
}) => {
  await asFamily(page);
  let saved: unknown;
  await page.route("**/api/producer/maeda", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      await r.fulfill({
        json: {
          name: "مطبخ أم سالم",
          style: (saved as { style: unknown }).style,
          hidden: ["finish:marble"],
        },
      });
    } else
      await r.fulfill({
        json: { name: "مطبخ أم سالم", style: null, hidden: ["finish:marble"] },
      });
  });
  await page.goto("/dashboard/maeda");
  await expect(
    page.getByRole("heading", { name: "اختر مائدتك" }),
  ).toBeVisible();
  const preview = page
    .locator("#maeda-preview")
    .locator("xpath=ancestor::section[1]");
  await expect(page.locator(".maeda-owner")).toHaveText("مطبخ أم سالم");
  // البداية: السدو المحفوظ، والحفظ معطل حتى يتغير شيء.
  await expect(page.getByRole("button", { name: /السدو/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const save = page.getByRole("button", { name: "احفظ المائدة" });
  await expect(save).toBeDisabled();
  // مائدة جاهزة: صينية النحاس، والمعاينة تتغير فورًا.
  await page.getByRole("button", { name: /صينية النحاس/ }).click();
  await expect(preview).toHaveAttribute("data-finish", "brass");
  await expect(preview).toHaveAttribute("data-shape", "oval");
  // التركيب اليدوي: الرخام مخفي من الإدارة فلا يظهر، والخشب يغيّر المعاينة.
  await page.getByText("ركّب مائدتك بنفسك").click();
  const finish = page.getByRole("group", { name: "الخامة" });
  await expect(finish.getByRole("radio", { name: "رخام" })).toHaveCount(0);
  await finish.getByRole("radio", { name: "خشب" }).check();
  await page
    .getByRole("group", { name: "اللون" })
    .getByRole("radio", { name: "زيتوني" })
    .check();
  await expect(preview).toHaveAttribute("data-finish", "wood");
  await expect(page.locator(".maeda-owner")).toHaveText("مطبخ أم سالم");
  await save.click();
  await expect(page.getByText("حُفظت المائدة")).toBeVisible();
  expect(saved).toEqual({
    style: {
      shape: "oval",
      finish: "wood",
      color: "zaytooni",
      edge: "gold",
      runner: false,
    },
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("the admin hides a table option from families in «قالب الموقع»", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "a",
          name: "المدير",
          phone: "+966500000009",
          role: "admin",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/admin/menu-layout", (r) =>
    r.fulfill({ json: { layout: null } }),
  );
  await page.route("**/api/admin/settings", (r) =>
    r.fulfill({
      json: {
        template: "simple",
        templates: ["classic", "simple"],
        palette: "sadu",
        palettes: ["sadu"],
      },
    }),
  );
  let put: unknown;
  await page.route("**/api/admin/maeda", async (r) => {
    if (r.request().method() === "PUT") {
      put = r.request().postDataJSON();
      await r.fulfill({
        json: {
          hidden: (put as { hidden: string[] }).hidden,
          used: { "finish:brass": 3 },
        },
      });
    } else
      await r.fulfill({ json: { hidden: [], used: { "finish:brass": 3 } } });
  });
  await page.goto("/admin/template");
  const section = page.getByRole("region", { name: "خيارات المائدة" });
  await expect(section).toBeVisible();
  const finish = section.getByRole("group", { name: "الخامة" });
  await expect(finish.getByText("3 أسرة تستعمله")).toBeVisible();
  const brass = finish.getByRole("checkbox", { name: /نحاس/ });
  // الخانة تتبع ردّ الخادم (لا تتغير قبل الحفظ)، فالنقر ثم انتظار الحالة.
  await brass.click();
  await expect(brass).not.toBeChecked();
  await expect(section.getByText("حُفظت خيارات المائدة")).toBeVisible();
  expect(put).toEqual({ hidden: ["finish:brass"] });
});
