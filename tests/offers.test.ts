import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";
import {
  offerSchema,
  preferenceSchema,
  offerVisible,
  saveOffer,
  listOffers,
  saveOfferPreferences,
  assertOfferAccess,
  getAccessibleOffer,
} from "../src/server/offers";
const value = {
  title: "عرض الغداء",
  description: "وجبة يومية",
  terms: "الاتفاق مع الأسرة",
  audience: "general",
  meal: "lunch",
  startsAt: "2026-11-01T00:00:00Z",
  endsAt: "2026-12-01T00:00:00Z",
  enabled: true,
  price: 20,
  productId: null,
};
test("offer validation bounds and time ordering", () => {
  assert.equal(offerSchema.parse(value).price, 20);
  for (const patch of [
    { title: "" },
    { price: -1 },
    { price: 1.005 },
    { audience: "verified-student" },
    { endsAt: value.startsAt },
    { productId: "bad" },
  ])
    assert.throws(() => offerSchema.parse({ ...value, ...patch }));
});
test("target enrollment explicitly bounded", () => {
  assert.deepEqual(
    preferenceSchema.parse({ groups: ["students", "families"] }).groups,
    ["students", "families"],
  );
  assert.throws(() => preferenceSchema.parse({ groups: ["general"] }));
});
test("single offer lookup rejects malformed IDs before querying", async () => {
  await assert.rejects(getAccessibleOffer(null, "invalid", randomUUID()), {
    status: 404,
  });
  await assert.rejects(getAccessibleOffer(null, randomUUID(), ""), {
    status: 404,
  });
});
test("visibility requires approval, enabled, time, product availability and enrolled target", () => {
  const row = {
    ...value,
    producerStatus: "approved",
    productVisible: true,
    productStatus: "available",
  };
  const now = new Date("2026-11-08T00:00:00Z");
  assert.equal(offerVisible(row, [], now), true);
  for (const patch of [
    { enabled: false },
    { producerStatus: "pending" },
    { endsAt: now.toISOString() },
    { startsAt: "2027-01-01T00:00:00Z" },
    { audience: "students" },
    { productId: "id", productVisible: false },
    { productId: "id", productStatus: "unavailable" },
  ])
    assert.equal(offerVisible({ ...row, ...patch }, [], now), false);
  assert.equal(
    offerVisible({ ...row, audience: "students" }, ["students"], now),
    true,
  );
});

test(
  "isolated DB offers enforce owner boundaries and saved target enrollment",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    const database = (await pool.query("SELECT current_database() AS name"))
      .rows[0].name;
    assert.match(database, /^jdatna_test_/);
    const ids = [randomUUID(), randomUUID()],
      producers = [randomUUID(), randomUUID()],
      product = randomUUID();
    const users = ids.map(
      (id, i) =>
        ({
          id,
          name: "offers test",
          phone: `offer-test-${id}`,
          role: "producer" as const,
        }) satisfies SessionUser,
    );
    let offerId: string | undefined;
    try {
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      for (let i = 0; i < 2; i++) {
        await pool.query(
          "INSERT INTO jdatna.users(id,phone,name,role,phone_verified_at) VALUES($1,$2,'offers test','producer',now())",
          [ids[i], users[i].phone],
        );
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$5,'offers test',$3,$4,'approved')",
          [producers[i], ids[i], city, users[i].phone, producers[i]],
        );
      }
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status) VALUES($1,$2,'offer product','test','meal','available')",
        [product, producers[0]],
      );
      const input = {
        ...value,
        startsAt: new Date(Date.now() - 60000).toISOString(),
        endsAt: new Date(Date.now() + 3600000).toISOString(),
        audience: "students",
        productId: product,
      };
      offerId = (await saveOffer(users[0], input, false)).id;
      assert.equal(
        (await listOffers(null)).some((o) => o.id === offerId),
        false,
      );
      await assert.rejects(
        assertOfferAccess(users[1], offerId, producers[0], product),
        { status: 404 },
      );
      await saveOfferPreferences(users[1], { groups: ["students"] });
      await assert.rejects(getAccessibleOffer(null, offerId, product), {
        status: 404,
      });
      await assert.rejects(
        getAccessibleOffer(users[1], offerId, randomUUID()),
        { status: 404 },
      );
      assert.deepEqual(await getAccessibleOffer(users[1], offerId, product), {
        id: offerId,
        productId: product,
        title: value.title,
        price: 20,
        terms: value.terms,
        meal: value.meal,
      });
      assert.equal(
        (await listOffers(users[1])).some((o) => o.id === offerId),
        true,
      );
      assert.deepEqual(
        await assertOfferAccess(users[1], offerId, producers[0], product),
        { label: value.title, price: 20, meal: value.meal },
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        assert.equal(
          (
            await assertOfferAccess(
              users[1],
              offerId,
              producers[0],
              product,
              client,
            )
          ).price,
          20,
        );
        await client.query("COMMIT");
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      await assert.rejects(
        saveOffer(users[1], { ...input, id: offerId, productId: null }, true),
        { status: 404 },
      );
      await assert.rejects(saveOffer(users[1], input, false), { status: 400 });
      await saveOffer(
        users[0],
        { ...input, id: offerId, enabled: false },
        true,
      );
      await assert.rejects(
        assertOfferAccess(users[1], offerId, producers[0], product),
        { status: 404 },
      );
      await saveOffer(users[0], { ...input, id: offerId }, true);
      await pool.query(
        "UPDATE jdatna.offers SET starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' WHERE id=$1",
        [offerId],
      );
      assert.equal(
        (await listOffers(users[1])).some((o) => o.id === offerId),
        false,
      );
      await assert.rejects(
        assertOfferAccess(users[1], offerId, producers[0], product),
        { status: 404 },
      );
      await saveOffer(users[0], { ...input, id: offerId }, true);
      await pool.query(
        "UPDATE jdatna.products SET status='unavailable' WHERE id=$1",
        [product],
      );
      await assert.rejects(
        assertOfferAccess(users[1], offerId, producers[0], product),
        { status: 404 },
      );
      await pool.query(
        "UPDATE jdatna.products SET status='available' WHERE id=$1",
        [product],
      );
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='suspended' WHERE id=$1",
        [producers[0]],
      );
      await assert.rejects(
        assertOfferAccess(users[1], offerId, producers[0], product),
        { status: 404 },
      );
      await assert.rejects(saveOffer(users[0], input, false), { status: 403 });
    } finally {
      await pool.query(
        "DELETE FROM jdatna.offer_preferences WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.offers WHERE producer_id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=$1", [product]);
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
    }
  },
);
