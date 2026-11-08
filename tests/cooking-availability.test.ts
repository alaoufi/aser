import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cookingAvailabilitySchema,
  riyadhDate,
  assertCookingStart,
  ownCookingAvailability,
  saveCookingAvailability,
} from "../src/server/cooking-availability";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { getProduct, getProducer, searchProducts } from "../src/server/catalog";
import { submitOrder, reorderDraft } from "../src/server/orders";
import { GET, PUT } from "../src/app/api/producer/availability/route";
test("cooking availability accepts only today's boolean state, never supplied family or date", () => {
  assert.deepEqual(cookingAvailabilitySchema.parse({ notCookingToday: true }), {
    notCookingToday: true,
  });
  for (const input of [
    { notCookingToday: "true" },
    { notCookingToday: true, producerId: "other" },
    { notCookingToday: true, date: "2026-11-09" },
  ])
    assert.throws(() => cookingAvailabilitySchema.parse(input));
});
test("availability routes require session and reject foreign-origin changes", async () => {
  assert.equal(
    (await GET(new Request("http://localhost/api/producer/availability"), {}))
      .status,
    401,
  );
  assert.equal(
    (
      await PUT(
        new Request("http://localhost/api/producer/availability", {
          method: "PUT",
          headers: {
            origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notCookingToday: true }),
        }),
        {},
      )
    ).status,
    403,
  );
});
test(
  "isolated daily availability scopes ownership, expires by Riyadh day and only blocks same-day orders",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const ids = [randomUUID(), randomUUID()],
      producers = [randomUUID(), randomUUID()],
      productId = randomUUID(),
      tag = randomUUID().slice(0, 8);
    const users = ids.map((id, i) => ({
      id,
      name: "cooking fixture",
      phone: `cooking-${tag}-${i}`,
      role: "producer" as const,
    }));
    try {
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      for (let i = 0; i < 2; i++) {
        await pool.query(
          "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'cooking fixture','producer',now())",
          [ids[i], users[i].phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'cooking fixture',$4,$5,$6)",
          [
            producers[i],
            ids[i],
            `cooking-${tag}-${i}`,
            city,
            users[i].phone,
            i === 0 ? "approved" : "pending",
          ],
        );
      }
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,price,unit,status) VALUES($1,$2,'cooking product','fixture',20,'meal','available')",
        [productId, producers[0]],
      );
      assert.equal(
        (await ownCookingAvailability(users[0])).notCookingToday,
        false,
      );
      const saved = await saveCookingAvailability(users[0], {
        notCookingToday: true,
      });
      assert.equal(saved.day, riyadhDate());
      await saveCookingAvailability(users[1], { notCookingToday: false });
      assert.equal(
        (await ownCookingAvailability(users[0])).notCookingToday,
        true,
        "other family cannot reopen first family",
      );
      assert.equal(
        (await ownCookingAvailability(users[1])).notCookingToday,
        false,
      );
      await assert.rejects(
        saveCookingAvailability(users[1], {
          notCookingToday: false,
          producerId: producers[0],
        }),
      );
      await saveCookingAvailability(users[1], { notCookingToday: true });
      assert.equal(
        await getProducer(`cooking-${tag}-1`),
        null,
        "pending family remains private",
      );
      assert.equal((await getProduct(productId))?.notCookingToday, true);
      assert.equal((await getProduct(productId))?.status, "available");
      assert.equal(
        (await searchProducts({ q: "cooking product", city })).some(
          (p) => p.id === productId,
        ),
        true,
        "closed product remains in unfiltered catalog",
      );
      assert.equal(
        (
          await searchProducts({
            q: "cooking product",
            city,
            status: "available",
          })
        ).some((p) => p.id === productId),
        false,
        "explicit available filter excludes today's closed family",
      );
      assert.equal(
        (await getProducer(`cooking-${tag}-0`))?.notCookingToday,
        true,
      );
      const payload = {
        productId,
        requestKey: randomUUID(),
        name: "عميل الاختبار",
        phone: "0500000011",
        quantity: 1,
        meal: "lunch",
        startDate: saved.day,
        days: 1,
        notes: "",
      };
      await assert.rejects(submitOrder(null, payload), { status: 409 });
      const tomorrow = new Date(
        new Date(saved.day + "T00:00:00Z").getTime() + 86400000,
      )
        .toISOString()
        .slice(0, 10);
      const receipt = await submitOrder(users[0], {
        ...payload,
        requestKey: randomUUID(),
        startDate: tomorrow,
      });
      assert.equal(receipt.status, "pending");
      assert.equal(
        (await reorderDraft(users[0], receipt.id)).notCookingToday,
        true,
      );
      await pool.query(
        "UPDATE jdatna.producer_cooking_days SET day=day-1 WHERE producer_id=$1",
        [producers[0]],
      );
      assert.equal(
        (await ownCookingAvailability(users[0])).notCookingToday,
        false,
        "yesterday off-day has expired automatically",
      );
      assert.equal((await getProduct(productId))?.notCookingToday, false);
      await saveCookingAvailability(users[0], { notCookingToday: true });
      await saveCookingAvailability(users[0], { notCookingToday: false });
      assert.equal(
        (await ownCookingAvailability(users[0])).notCookingToday,
        false,
      );
      assert.equal(
        (
          await searchProducts({
            q: "cooking product",
            city,
            status: "available",
          })
        ).some((p) => p.id === productId),
        true,
        "reopened product returns to available filter",
      );
      assert.equal(
        (await submitOrder(null, { ...payload, requestKey: randomUUID() }))
          .status,
        "pending",
      );
      assert.deepEqual(
        (
          await pool.query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[]) ORDER BY status",
            [producers],
          )
        ).rows.map((r) => r.status),
        ["approved", "pending"],
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_cooking_days WHERE producer_id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [productId]);
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.end();
    }
  },
);
test("Riyadh cooking day changes at21UTC and closes only today's requests", () => {
  assert.equal(riyadhDate(new Date("2026-11-08T20:59:59Z")), "2026-11-08");
  assert.equal(riyadhDate(new Date("2026-11-08T21:00:00Z")), "2026-11-09");
  assert.throws(() => assertCookingStart(true, "2026-11-09", "2026-11-09"), {
    status: 409,
  });
  assert.doesNotThrow(() =>
    assertCookingStart(true, "2026-11-10", "2026-11-09"),
  );
  assert.doesNotThrow(() =>
    assertCookingStart(false, "2026-11-09", "2026-11-09"),
  );
});
