import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { checkLocation, ownZones, saveZones } from "../src/server/zones";

test(
  "isolated delivery zones: family draws, validated, member point checked against approved families only",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const tag = randomUUID().slice(0, 8);
    const owner = {
      id: randomUUID(),
      name: "أسرة المناطق",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer" as const,
    };
    const customer = { ...owner, id: randomUUID(), role: "customer" as const };
    const producerId = randomUUID(),
      slug = "zones-" + tag;
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
        [owner.id, owner.name, owner.phone],
      );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المناطق',$4,$5,'pending')",
        [producerId, owner.id, slug, city, owner.phone],
      );
      await assert.rejects(saveZones(customer, { zones: [] }), { status: 403 });
      const north = {
        name: "شمال الرياض",
        fee: 15,
        points: [
          [24.8, 46.6],
          [24.8, 46.7],
          [24.9, 46.7],
          [24.9, 46.6],
        ],
      };
      const wide = {
        name: "الرياض كلها",
        fee: 25,
        points: [
          [24.5, 46.5],
          [24.5, 46.9],
          [25.0, 46.9],
          [25.0, 46.5],
        ],
      };
      await assert.rejects(
        saveZones(owner, {
          zones: [{ ...north, points: north.points.slice(0, 2) }],
        }),
        /ثلاث نقاط/,
      );
      await assert.rejects(
        saveZones(owner, {
          zones: [
            { ...north, points: [[51.5, -0.1], ...north.points.slice(1)] },
          ],
        }),
        /خارج المملكة/,
      );
      await saveZones(owner, { zones: [north, wide] });
      assert.deepEqual(
        (await ownZones(owner)).map((z) => [z.name, z.fee, z.points.length]),
        [
          ["شمال الرياض", 15, 4],
          ["الرياض كلها", 25, 4],
        ],
      );
      // قبل اعتماد الأسرة: لا فحص عام.
      assert.deepEqual(
        await checkLocation({ producer: slug, lat: 24.85, lng: 46.65 }),
        { covered: false, hasZones: false },
      );
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='approved' WHERE id=$1",
        [producerId],
      );
      // التداخل: المنطقة الأقل رسومًا.
      assert.deepEqual(
        await checkLocation({ producer: slug, lat: 24.85, lng: 46.65 }),
        { covered: true, hasZones: true, zone: "شمال الرياض", fee: 15 },
      );
      assert.deepEqual(
        await checkLocation({ producer: slug, lat: 24.6, lng: 46.8 }),
        { covered: true, hasZones: true, zone: "الرياض كلها", fee: 25 },
      );
      assert.deepEqual(
        await checkLocation({ producer: slug, lat: 21.5, lng: 39.2 }),
        { covered: false, hasZones: true },
      );
      await assert.rejects(
        checkLocation({ producer: slug, lat: 51.5, lng: -0.1 }),
        { status: 400 },
      );
      await saveZones(owner, { zones: [] });
      assert.equal((await ownZones(owner)).length, 0);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.producer_zones WHERE producer_id=$1",
        [producerId],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        producerId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [owner.id]);
      await pool.end();
    }
  },
);
