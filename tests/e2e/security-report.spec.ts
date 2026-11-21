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

// الإدارة ← مجموعة «التقارير»: التقرير الأمني والنسخ الاحتياطية، وتقرير النسخ يعرض النوع والحجم والتحميل.
test("reports group lists the security and backups reports, and the backups report shows contents and download", async ({
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
  await page.route("**/api/admin/backups", (r) =>
    r.fulfill({
      json: {
        downloadEnabled: true,
        remoteReady: true,
        requests: [],
        latestAt: new Date().toISOString(),
        backups: [
          {
            file: "jdatna-20261119T020000Z.tar.gpg",
            createdAt: new Date().toISOString(),
            kind: "daily",
            sizeBytes: 210 * 1024 * 1024,
            databaseBytes: 6 * 1024 * 1024,
            mediaBytes: 204 * 1024 * 1024,
            codeBytes: 0,
            sha256: "a".repeat(64),
            remote: true,
            onServer: true,
            downloadable: true,
          },
          {
            file: "jdatna-20261118T020000Z.tar.gpg",
            createdAt: new Date(Date.now() - 864e5).toISOString(),
            kind: "codedb",
            sizeBytes: 9 * 1024 * 1024,
            databaseBytes: 5 * 1024 * 1024,
            mediaBytes: 0,
            codeBytes: 4 * 1024 * 1024,
            sha256: null,
            remote: false,
            onServer: false,
            downloadable: false,
          },
        ],
      },
    }),
  );
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto("/admin?tab=backups");
  const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
  await nav.locator("summary").click();
  const reports = nav.getByRole("group", { name: "التقارير" });
  await expect(reports.getByRole("button")).toHaveText([
    "التقرير الأمني",
    "النسخ الاحتياطية",
  ]);
  await page.keyboard.press("Escape");
  const report = page.getByRole("region", { name: "النسخ الاحتياطية" });
  const rows = report.getByRole("table", { name: "النسخ" }).locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("بيانات: 6.0 م.ب");
  await expect(rows.first()).toContainText("ميديا: 204.0 م.ب");
  await expect(
    rows.first().getByRole("link", { name: "تحميل" }),
  ).toHaveAttribute(
    "href",
    "/api/admin/backups/jdatna-20261119T020000Z.tar.gpg",
  );
  await expect(rows.first()).toContainText("مرفوعة إلى R2");
  // النسخة اليومية: نوعها ومحتواها، وأمر استعادة جاهز للنسخ (قرار المالك: لا زر استعادة في الموقع).
  await expect(rows.first()).toContainText("يومية (5:00 فجرًا)");
  await expect(rows.first()).toContainText(
    "قاعدة البيانات، الإعدادات، الصور والمستندات",
  );
  await rows.first().getByText("أمر الاستعادة").click();
  await expect(rows.first().locator("code")).toHaveText(
    'ssh -t root@84.247.166.216 "bash /opt/jdatna/infra/backup-restore.sh jdatna-20261119T020000Z.tar.gpg"',
  );
  await expect(rows.nth(1).getByText("أمر الاستعادة")).toHaveCount(0);
  await expect(report).toContainText("آخر 10");
  await expect(rows.nth(1)).toContainText("كود وقاعدة بيانات");
  await expect(rows.nth(1)).toContainText("كود: 4.0 م.ب");
  await expect(rows.nth(1)).toContainText("حُذفت من الخادم");
  // «خذ نسخة الآن» بنوع يختاره المدير.
  let asked: unknown;
  await page.route("**/api/admin/backups", async (r) => {
    if (r.request().method() !== "POST") return r.fallback();
    asked = r.request().postDataJSON();
    return r.fulfill({
      status: 201,
      json: {
        downloadEnabled: true,
        remoteReady: true,
        latestAt: null,
        backups: [],
        requests: [
          {
            id: "q1",
            kind: "media",
            status: "pending",
            requestedAt: new Date().toISOString(),
            finishedAt: null,
            file: null,
            error: null,
          },
        ],
      },
    });
  });
  const take = report.getByRole("form", { name: "خذ نسخة الآن" });
  await take.getByRole("radio", { name: /الصور والمستندات/ }).check();
  await take.getByRole("button", { name: "خذ نسخة الآن" }).click();
  await expect(take.getByRole("status")).toContainText("بانتظار الخادم");
  await expect(
    take.getByRole("button", { name: "جارٍ أخذ النسخة…" }),
  ).toBeDisabled();
  expect(asked).toEqual({ kind: "media" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
