import { test, expect } from "@playwright/test";

test("the security report shows period cards, daily chart, top countries and IPs, and an events table", async ({
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
  const asked: URLSearchParams[] = [];
  await page.route("**/api/admin/security?**", (r) => {
    const q = new URL(r.request().url()).searchParams;
    asked.push(q);
    const from = q.get("from")!;
    const to = q.get("to")!;
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    return r.fulfill({
      json: {
        range: { from, to, days },
        cards: {
          attempts: 12474,
          sources: 295,
          countries: 48,
          perDay: 1782,
          loginFailed: 120,
          otpFailed: 30,
          rateLimited: 4,
          denied: 2,
          locked: 1,
          adminLogins: 1,
        },
        daily: Array.from({ length: days }, (_, i) => ({
          day: new Date(Date.parse(from) + i * 86400000)
            .toISOString()
            .slice(0, 10),
          failed: i * 3,
          blocked: i,
        })),
        topCountries: [
          { code: "NL", count: 5611 },
          { code: "FR", count: 2121 },
        ],
        topIps: [{ ip: "109.160.32.136", count: 1286, code: "NL" }],
        events: [
          {
            at: new Date().toISOString(),
            kind: "login.failed",
            status: "failed",
            ip: "222.210.35.197",
            code: "CN",
            attempts: 4,
            detail: "كلمة مرور خاطئة · 05••••••67",
          },
        ],
      },
    });
  });
  await page.goto("/admin?tab=security");
  const report = page.getByRole("region", { name: "التقرير الأمني" });
  await expect(
    report.getByRole("heading", { name: "التقرير الأمني" }),
  ).toBeVisible();
  // الافتراضي آخر 7 أيام.
  await expect(report).toContainText("(7 يوم)");
  const cards = report.getByRole("list", { name: "ملخص الفترة" });
  await expect(cards).toContainText("12,474");
  await expect(cards).toContainText("إجمالي محاولات الاختراق");
  await expect(cards.getByRole("listitem")).toHaveCount(10);
  await expect(
    report.getByRole("figure", { name: "المحاولات يوميًا" }),
  ).toBeVisible();
  const countries = report.getByRole("region", { name: "أكثر الدول هجومًا" });
  await expect(countries).toContainText("هولندا");
  await expect(countries).toContainText("5,611");
  await expect(
    report.getByRole("region", { name: "أكثر العناوين هجومًا" }),
  ).toContainText("109.160.32.136");
  const events = report.getByRole("table", { name: "الأحداث" });
  await expect(events).toContainText("222.210.35.197");
  await expect(events).toContainText("الصين");
  await expect(events).toContainText("فشل");
  await expect(events).toContainText("05••••••67");
  await expect(report).toContainText("IP Geolocation by DB-IP");
  // الفترات والتصفية تطلب التقرير من جديد.
  await report.getByRole("button", { name: "30 يومًا" }).click();
  await expect(report).toContainText("(30 يوم)");
  await report.getByLabel("الحالة").selectOption("blocked");
  await expect.poll(() => asked.at(-1)?.get("status")).toBe("blocked");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
