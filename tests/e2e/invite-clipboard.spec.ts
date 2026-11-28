import { expect, test, type Page } from "@playwright/test";

/**
 * تطبيق الآيفون (قرار المالك 2026-11-28): أول فتح قبل الدخول يقرأ رابط الدعوة من الحافظة
 * (إضافة Capacitor Clipboard، مُحاكاة هنا)، فيُحفظ رقم الدعوة ويُفتح «حساب جديد». مرة واحدة فقط،
 * ولا يقرأ لمن سجّل دخوله، ولا يأخذ إلا رابط دعوة.
 */
async function asApp(page: Page, clip: string, user: unknown = null) {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.addInitScript((value) => {
    const w = window as unknown as Record<string, unknown>;
    w.__reads = 0;
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        Clipboard: {
          read: async () => {
            w.__reads = (w.__reads as number) + 1;
            return { type: "text/plain", value };
          },
        },
      },
    };
  }, clip);
}
const reads = (page: Page) =>
  page.evaluate(() => (window as unknown as { __reads: number }).__reads);

test("the iPhone app picks the invite from the clipboard once and opens sign-up", async ({
  page,
  context,
}) => {
  await asApp(page, "https://jdtna.sa/r/241");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?signup=1/);
  const ref = (await context.cookies()).find((c) => c.name === "jdatna_ref");
  expect(ref?.value).toBe("241");
  // لا يقرأ الحافظة مرة أخرى في الفتح التالي.
  await page.goto("/");
  await page.waitForTimeout(800);
  expect(await reads(page)).toBe(0);
  await expect(page).not.toHaveURL(/signup/);
});

test("the iPhone app ignores other copied text and never reads for a signed-in member", async ({
  page,
  context,
}) => {
  await asApp(page, "0551234567");
  await page.goto("/");
  await page.waitForTimeout(800);
  expect(await reads(page)).toBe(1);
  await expect(page).not.toHaveURL(/signup/);
  expect(
    (await context.cookies()).find((c) => c.name === "jdatna_ref"),
  ).toBeUndefined();

  const member = await context.newPage();
  await asApp(member, "https://jdtna.sa/r/241", {
    id: "u",
    name: "عضو",
    phone: "+966500000001",
    role: "customer",
  });
  await member.evaluate(() => localStorage.clear()).catch(() => {});
  await member.goto("/");
  await member.evaluate(() => localStorage.clear());
  await member.reload();
  await member.waitForTimeout(800);
  expect(await reads(member)).toBe(0);
});
