import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/**
 * الإعلانات الترويجية (من «أي خدمة»):
 * - إعلان الإدارة يظهر في مكانه بإطار ثابت 3:1، بلا كلمة «إعلان»، وزر ✕ يخفيه على هذا الجهاز.
 * - صفحة الإدارة: إعلان جديد بأماكنه، وصورة لا تناسب الإطار تُعرض قبل وبعد القص، و«لماذا لا يظهر».
 */
test.describe("promotional ads on the site", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database",
  );
  test.describe.configure({ mode: "serial" });
  let pool: Pool | undefined;
  const id = randomUUID();
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
    ).toMatch(/^jdatna_test_/);
    await pool.query(
      `INSERT INTO jdatna.ads(id,title,description,link,placements,status) VALUES($1,'عرض الجمعة من جدتنا','جريش ومرقوق','/offers',ARRAY['home_top'],'active')`,
      [id],
    );
  });
  test.afterAll(async () => {
    await pool?.query("DELETE FROM jdatna.ads WHERE id=$1", [id]);
    await pool?.end();
  });

  test("the admin's ad shows in its place without an «ad» mark, and ✕ hides it on this device", async ({
    page,
  }) => {
    await page.goto("/");
    const slot = page.locator('[data-placement="home_top"]');
    await expect(slot).toContainText("عرض الجمعة من جدتنا");
    await expect(slot.getByText("إعلان", { exact: true })).toHaveCount(0);
    await expect(slot.getByRole("link")).toHaveAttribute("href", "/offers");
    // الإعلان داخل عرض الشاشة كاملًا (لا يُقص ولا يخرج عن الصفحة).
    const box = (await slot.boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await slot.getByRole("button", { name: "إخفاء الإعلان" }).click();
    await expect(slot).toHaveCount(0);
    await page.reload();
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.locator('[data-placement="home_top"]')).toHaveCount(0);
    // المشاهدة حُسبت مرة.
    await expect
      .poll(
        async () =>
          (
            await pool!.query(
              "SELECT views_count FROM jdatna.ads WHERE id=$1",
              [id],
            )
          ).rows[0].views_count,
      )
      .toBeGreaterThanOrEqual(1);
  });
});

test("the owner adds an ad, a picture of another shape is shown before and after the crop, and why-not explains", async ({
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
  let saved: Record<string, unknown> | null = null;
  const empty = {
    ads: [],
    campaigns: [],
    regions: [{ id: "riyadh", name: "منطقة الرياض" }],
  };
  const ad = {
    id: "00000000-0000-4000-8000-0000000000a1",
    title: "عرض الجمعة",
    description: null,
    link: "/offers",
    mediaId: "00000000-0000-4000-8000-0000000000b1",
    mediaType: "image",
    placements: ["home_top", "browse_top"],
    status: "paused",
    startsAt: null,
    endsAt: null,
    maxViews: null,
    dailyMaxViews: null,
    freqCapPerDay: null,
    priority: 2,
    weight: 1,
    pacing: "asap",
    schedule: null,
    targetRegions: [],
    targetDevices: [],
    targetAudience: [],
    campaignId: null,
    campaignName: null,
    exclusive: false,
    viewsCount: 0,
    clicksCount: 0,
    todayViews: 0,
  };
  await page.route("**/api/admin/ads", (r) => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { ...empty, ads: [ad] } });
    }
    return r.fulfill({ json: empty });
  });
  let uploaded: string | null = null;
  await page.route("**/api/admin/ads/media", async (r) => {
    uploaded = r.request().postDataBuffer()?.includes(Buffer.from("-fit.jpg"))
      ? "fit"
      : "raw";
    return r.fulfill({
      json: {
        id: ad.mediaId,
        url: `/api/ads/media/${ad.mediaId}`,
        mediaType: "image",
      },
    });
  });
  await page.route("**/api/ads/media/**", (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: Buffer.alloc(0) }),
  );
  await page.route("**/api/admin/ads/*/why**", (r) =>
    r.fulfill({
      json: {
        live: false,
        checks: [
          { ok: false, text: "الإعلان موقوف", fix: "activate" },
          { ok: true, text: "بلا تاريخ نهاية", fix: "endsAt" },
        ],
      },
    }),
  );
  await page.goto("/admin/ads");
  await expect(page.locator("main")).toContainText(
    "الاشتراك بالإعلان (صفحة «أعلن» للأعضاء): الآن موقوف",
  );
  await page.getByRole("button", { name: "＋ إعلان جديد" }).click();
  const form = page.getByRole("form", { name: "إعلان جديد" });
  await form.getByLabel("عنوان الإعلان").fill("عرض الجمعة");
  await form.getByLabel("الرابط عند الضغط (اختياري)").fill("/offers");
  await form.getByLabel("طبخات اليوم: أعلى").check();
  // صورة طولية 400×600 لا تناسب الإطار 1200×400: تُعرض قبل وبعد القص.
  const tall = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 600;
    c.getContext("2d")!.fillRect(0, 0, 400, 600);
    const blob = await new Promise<Blob>((res) =>
      c.toBlob((b) => res(b!), "image/png"),
    );
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await form.getByLabel("صورة أو مقطع الإعلان").setInputFiles({
    name: "tall.png",
    mimeType: "image/png",
    buffer: Buffer.from(tall),
  });
  const fit = form.getByRole("region", { name: "تعديل الصورة للإطار" });
  await expect(fit).toContainText("لا تناسب الإطار 1200×400");
  await expect(fit.getByRole("img", { name: "بعد" })).toBeVisible();
  await fit.getByRole("button", { name: "الأعلى" }).click();
  await fit.getByRole("button", { name: "موافق" }).click();
  await expect.poll(() => uploaded).toBe("fit");
  await form.getByRole("button", { name: "حفظ الإعلان" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "تمت إضافة الإعلان",
  );
  expect(saved).toMatchObject({
    title: "عرض الجمعة",
    link: "/offers",
    mediaId: ad.mediaId,
    placements: ["home_top", "browse_top"],
    priority: 2,
    status: "active",
  });
  // «لماذا يظهر أو لا يظهر»: الشرط المانع وزر إصلاحه.
  const card = page
    .getByRole("list", { name: "الإعلانات" })
    .getByRole("listitem")
    .first();
  await card.getByRole("button", { name: "لماذا يظهر أو لا يظهر؟" }).click();
  const why = card.getByRole("region", { name: "فحص ظهور «عرض الجمعة»" });
  await expect(why).toContainText("الإعلان لا يظهر الآن");
  await expect(
    why.getByRole("button", { name: "تنشيط الإعلان الآن" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
