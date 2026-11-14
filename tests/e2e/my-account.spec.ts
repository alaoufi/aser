import { test, expect } from "@playwright/test";

// «معلوماتي»: حساب المدير الخاص منفصل عن حساب الإدارة، ويعدّل اسمه وكلمة مروره.
test("admin's personal account is separate from the admin account and edits name and password", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "o",
          name: "المالك",
          phone: "+966500000099",
          role: "admin",
          username: "owner",
        },
        registrationOpen: true,
      },
    }),
  );
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/account/me", async (r) => {
    const body = r.request().postDataJSON();
    sent.push(body);
    if (body.newPassword && body.currentPassword !== "1111")
      return r.fulfill({
        status: 400,
        json: { error: "كلمة المرور الحالية غير صحيحة" },
      });
    return r.fulfill({
      json: {
        user: {
          id: "o",
          name: body.name ?? "المالك",
          phone: "+966500000099",
          role: "admin",
          username: "owner",
        },
      },
    });
  });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "معلوماتي" })).toBeVisible();
  const personal = page.getByRole("navigation", { name: "حسابي", exact: true });
  await expect(personal.getByRole("link", { name: "طلباتي" })).toBeVisible();
  await expect(personal.getByRole("link", { name: "معلوماتي" })).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: "حساب الإدارة" }),
  ).toHaveAttribute("href", "/admin");
  await expect(page.getByLabel("رقم الجوال")).toHaveValue("+966500000099");
  await page.getByLabel("الاسم", { exact: true }).fill("أبو محمد");
  await page.getByRole("button", { name: "حفظ الاسم" }).click();
  await expect(page.getByText("تم حفظ الاسم ✓")).toBeVisible();
  expect(sent[0]).toEqual({ name: "أبو محمد" });

  const pwd = page.getByRole("form", { name: "تغيير كلمة المرور" });
  await pwd.getByLabel("كلمة المرور الحالية", { exact: true }).fill("9999");
  await pwd.getByLabel("كلمة المرور الجديدة", { exact: true }).fill("2468");
  await pwd.getByLabel("تأكيد كلمة المرور الجديدة").fill("2468");
  await pwd.getByRole("button", { name: "تغيير كلمة المرور" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "كلمة المرور الحالية غير صحيحة",
  );
  await pwd.getByLabel("كلمة المرور الحالية", { exact: true }).fill("1111");
  await pwd.getByRole("button", { name: "تغيير كلمة المرور" }).click();
  await expect(page.getByText(/تم تغيير كلمة المرور/)).toBeVisible();
  expect(sent.at(-1)).toEqual({ currentPassword: "1111", newPassword: "2468" });
});
