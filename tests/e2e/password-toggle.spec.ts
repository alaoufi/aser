import { test, expect } from "@playwright/test";

// «إظهار كلمة المرور» في الدخول، ولصق رقم الجوال بأي صيغة في اسم المستخدم.
test("login shows the password on demand and accepts a pasted phone", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  let sent: Record<string, string> | undefined;
  await page.route("**/api/auth/password-login", (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({
      status: 401,
      json: { error: "اسم الدخول أو كلمة المرور غير صحيحة" },
    });
  });
  await page.goto("/login");
  const id = page.getByLabel("اسم المستخدم أو رقم الجوال");
  // لصق من جهات الاتصال: علامات اتجاه خفية ومسافات.
  await id.focus();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text/plain", "‪+966 53 221 7166‬");
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
    );
    if (!el.value) {
      el.value = "‪+966 53 221 7166‬";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await expect(id).not.toHaveValue("");
  const password = page.getByLabel("كلمة المرور", { exact: true });
  await password.fill("سر-1234");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "إظهار كلمة المرور" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("سر-1234");
  await page.getByRole("button", { name: "إخفاء كلمة المرور" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "دخول", exact: true }).click();
  await expect.poll(() => sent?.identifier).toContain("221 7166");
});
