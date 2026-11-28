import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test("today's table sits on the home page and says the dishes have not arrived when empty", async ({
  page,
}) => {
  await page.goto("/");
  const table = page.getByRole("region", { name: "مائدة اليوم" });
  await expect(table).toBeVisible();
  // بيئة الاختبار بلا أطباق متوفرة اليوم.
  await expect(table).toContainText("بانتظار العروض");
  await expect(table.getByRole("link", { name: /افتح المائدة/ })).toHaveCount(
    0,
  );
  await page.goto("/table");
  await expect(page.getByRole("region", { name: "مائدة اليوم" })).toContainText(
    "بانتظار العروض",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test.describe("today's table on a real isolated catalog", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    productId = randomUUID();
  const dish = "مرقوق مائدة اليوم " + productId.slice(0, 6);
  let pool: Pool | undefined,
    region = "",
    otherRegion = "",
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const name = (await pool.query("SELECT current_database() AS name")).rows[0]
      .name as string;
    expect(name.startsWith("jdatna_test_")).toBe(true);
    const city = (
      await pool.query(
        "SELECT c.id,c.region_id FROM jdatna.cities c WHERE c.id !~ '^[0-9a-f]{8}-' ORDER BY c.id LIMIT 1",
      )
    ).rows[0];
    region = city.region_id;
    otherRegion = (
      await pool.query("SELECT id FROM jdatna.regions WHERE id<>$1 LIMIT 1", [
        region,
      ])
    ).rows[0].id;
    started = true;
    const phone =
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة المائدة',$2,'producer',now())",
      [userId, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المائدة',$4,$5,'approved')",
      [producerId, userId, "table-" + producerId, city.id, phone],
    );
    await pool.query(
      "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,$3,'طبق متوفر اليوم',20,'صحن','available')",
      [productId, producerId, dish],
    );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query("DELETE FROM jdatna.products WHERE id=$1", [
          productId,
        ]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("dishes available today show for the chosen region and open the bigger table", async ({
    page,
  }) => {
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    const table = page.getByRole("region", { name: "مائدة اليوم" });
    // الرئيسية (طلب المالك 2026-11-28): صورة الطبق فقط على المائدة؛ الضغط يكتب بياناته تحتها.
    const plate = table.getByRole("button", { name: dish, exact: true });
    await expect(plate).toBeVisible();
    await expect(table.getByText(dish, { exact: true })).toHaveCount(0);
    await plate.click();
    await expect(plate).toHaveAttribute("aria-pressed", "true");
    const card = table.getByRole("link", { name: new RegExp(dish) });
    await expect(card).toContainText(/٢٠|20/);
    await expect(card).toContainText("أسرة المائدة");
    // 1) الضغط على البيانات يفتح التفاصيل.
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    // 2) نقرتان على الطبق.
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    await table.getByRole("button", { name: dish, exact: true }).dblclick();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`));
    // 3) ضغطة مطوّلة.
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    const again = table.getByRole("button", { name: dish, exact: true });
    await again.scrollIntoViewIfNeeded();
    const box = (await again.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page).toHaveURL(new RegExp(`/products/${productId}$`), {
      timeout: 5000,
    });
    await page.mouse.up();
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    await table.getByRole("link", { name: /افتح المائدة كاملة/ }).click();
    await expect(page).toHaveURL(/\/table\?region=/);
    await expect(
      page.getByRole("link", { name: new RegExp(dish) }),
    ).toBeVisible();
    // منطقة أخرى: الطبق لا يظهر، ويُحفظ الاختيار في الجهاز.
    await page.getByLabel("منطقة المائدة").selectOption(otherRegion);
    await expect(page).toHaveURL(new RegExp(`region=${otherRegion}`));
    await expect(
      page.getByRole("link", { name: new RegExp(dish) }),
    ).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByLabel("منطقة المائدة")).toHaveValue(otherRegion);
  });
});

test.describe("today's table pages with arrows outside it, in a random order", () => {
  test.skip(
    process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
    "Requires isolated database environment",
  );
  const userId = randomUUID(),
    producerId = randomUUID(),
    customerId = randomUUID();
  const ids = Array.from({ length: 10 }, () => randomUUID());
  const tag = producerId.slice(0, 6);
  let pool: Pool | undefined,
    region = "",
    started = false;
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    expect(
      (
        (await pool.query("SELECT current_database() AS n")).rows[0].n as string
      ).startsWith("jdatna_test_"),
    ).toBe(true);
    const city = (
      await pool.query(
        "SELECT id,region_id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' ORDER BY id LIMIT 1",
      )
    ).rows[0];
    region = city.region_id;
    started = true;
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'أسرة الأسهم',$2,'producer',now()),($3,'عميل الأسهم',$4,'customer',now())",
      [userId, phone(), customerId, phone()],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة الأسهم',$4,$5,'approved')",
      [producerId, userId, "arrows-" + producerId, city.id, phone()],
    );
    for (const [i, id] of ids.entries())
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status,created_at) VALUES($1,$2,$3,'طبق',10,'صحن','available',now()-($4||' minutes')::interval)",
        [id, producerId, `طبق ${tag} ${i}`, String(i)],
      );
    // الأقدم (رقم 9) هو الأكثر طلبًا فيجب أن يتصدر.
    for (let n = 0; n < 3; n++)
      await pool.query(
        "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date) VALUES($1,$2,'h',$3,$4,$5,'{}','عميل','+966500000000',1,'lunch',current_date+1,current_date+1)",
        [randomUUID(), randomUUID(), customerId, producerId, ids[9]],
      );
  });
  test.afterAll(async () => {
    try {
      if (pool && started) {
        await pool.query(
          "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
          [producerId],
        );
        await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
          producerId,
        ]);
        await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
          [userId, customerId],
        ]);
      }
    } finally {
      await pool?.end();
    }
  });
  test("arrows outside the table page through the dishes, all of them on the table", async ({
    page,
  }) => {
    await page.goto(`/?region=${encodeURIComponent(region)}`);
    const table = page.getByRole("region", { name: "مائدة اليوم" });
    const ours = table.getByRole("button", { name: new RegExp(`طبق ${tag}`) });
    // الترتيب عشوائي مع كل تحديث (قرار المالك 2026-11-28): أطباقنا العشرة كلها على المائدة.
    await expect(ours).toHaveCount(10);
    const prev = table.getByRole("button", { name: "الأطباق السابقة" });
    const next = table.getByRole("button", { name: "الأطباق التالية" });
    const track = table.locator(".table-track");
    // السهمان خارج خشب المائدة (أخوان لها في الصف، لا داخلها).
    expect(
      await table.evaluate((el) => {
        const wood = el
          .querySelector(".table-paged > .table-3d")!
          .getBoundingClientRect();
        return [...el.querySelectorAll(".table-paged > .table-arrow")]
          .filter((a) => !(a as HTMLElement).hidden)
          .map((a) => {
            const r = a.getBoundingClientRect();
            return r.right <= wood.left + 1 || r.left >= wood.right - 1
              ? "out"
              : `in ${Math.round(r.left)}-${Math.round(r.right)} / ${Math.round(wood.left)}-${Math.round(wood.right)}`;
          });
      }),
    ).not.toContainEqual(expect.stringMatching(/^in/));
    // الكمبيوتر يتسع لكل الأطباق (6×3)، فلا أسهم؛ الجوال 3×3 فيتقلّب بالأسهم.
    if ((page.viewportSize()?.width ?? 1280) >= 900) {
      await expect(next).toBeHidden();
      return;
    }
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();
    await next.click();
    await expect
      .poll(() => track.evaluate((el) => Math.abs(el.scrollLeft)))
      .toBeGreaterThan(50);
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect
      .poll(() => track.evaluate((el) => Math.abs(el.scrollLeft)))
      .toBeLessThan(5);
  });
});
