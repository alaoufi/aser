import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test("family draws a delivery zone on the map, names it, sets a fee and saves", async ({
  page,
}) => {
  await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "f1",
          name: "أسرة",
          phone: "+966500000003",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
  await page.route("**/api/coverage", (r) =>
    r.fulfill({ json: { nodes: [] } }),
  );
  await page.route("**/api/producer/coverage", (r) =>
    r.fulfill({ json: { areas: [], customAreas: [], legacyAreas: [] } }),
  );
  let saved: any;
  await page.route("**/api/producer/zones", async (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: { zones: 1 } });
    }
    return r.fulfill({ json: { zones: [] } });
  });
  await page.goto("/dashboard/coverage");
  const section = page.getByRole("region", {
    name: "مناطق التوصيل على الخريطة",
  });
  const map = section.getByRole("application", { name: "خريطة مناطق التوصيل" });
  await expect(map).toHaveAttribute("data-ready", "true");
  await section.getByRole("button", { name: "ارسم منطقة جديدة" }).click();
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  const finish = section.getByRole("button", { name: /أنهِ المنطقة/ });
  await expect(finish).toBeDisabled();
  for (const [x, y] of [
    [0.3, 0.3],
    [0.7, 0.3],
    [0.7, 0.7],
    [0.3, 0.7],
  ])
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await expect(finish).toHaveText("أنهِ المنطقة (4 نقاط)");
  await section.getByRole("button", { name: "تراجع عن آخر نقطة" }).click();
  await expect(finish).toHaveText("أنهِ المنطقة (3 نقاط)");
  await finish.click();
  await section.getByLabel("اسم المنطقة").fill("حي النرجس");
  await section.getByLabel("رسوم التوصيل (ريال، اختيارية)").fill("12");
  await section.getByRole("button", { name: "حفظ مناطق التوصيل" }).click();
  await expect(section.getByRole("status")).toHaveText(
    "تم حفظ مناطق التوصيل على الخريطة.",
  );
  expect(saved.zones).toHaveLength(1);
  expect(saved.zones[0]).toMatchObject({ name: "حي النرجس", fee: 12 });
  expect(saved.zones[0].points).toHaveLength(3);
  for (const [lat, lng] of saved.zones[0].points) {
    expect(lat).toBeGreaterThan(24);
    expect(lat).toBeLessThan(25.5);
    expect(lng).toBeGreaterThan(46);
    expect(lng).toBeLessThan(47.5);
  }
});

test.describe("member checks a real family's delivery zone", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    slug = "zone-check-" + producerId;
  let pool: Pool | undefined,
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
      .rows[0].id;
    started = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة الخريطة',$2,'producer',now())",
      [userId, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,delivery) VALUES($1,$2,$3,'أسرة الخريطة',$4,$5,'approved',true)",
      [producerId, userId, slug, city, phone],
    );
    // منطقة حول وسط الخريطة الافتراضي (الرياض).
    await pool.query(
      "INSERT INTO jdatna.producer_zones(id,producer_id,name,fee,points) VALUES($1,$2,'وسط الرياض',10,$3)",
      [
        randomUUID(),
        producerId,
        JSON.stringify([
          [24.68, 46.63],
          [24.68, 46.72],
          [24.75, 46.72],
          [24.75, 46.63],
        ]),
      ],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.producer_zones WHERE producer_id=$1",
          [producerId],
        );
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("a pin inside the zone is covered with its fee, a pin far away is not", async ({
    page,
  }) => {
    await page.route("**/tile.openstreetmap.org/**", (r) => r.abort());
    await page.goto(`/producers/${slug}`);
    const check = page.getByRole("region", { name: "هل توصل الأسرة لموقعك؟" });
    const map = check.getByRole("application", {
      name: "حدد موقعك على الخريطة",
    });
    await map.scrollIntoViewIfNeeded();
    await expect(map).toHaveAttribute("data-ready", "true");
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(check).toContainText("موقعك ضمن منطقة التوصيل «وسط الرياض»");
    await expect(check).toContainText("رسوم التوصيل 10 ر.س");
    await page.mouse.click(box.x + 6, box.y + box.height - 20);
    await expect(check).toContainText("موقعك خارج مناطق توصيل هذه الأسرة");
  });
});
