import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  coverageSchema,
  saveCoverage,
  ownCoverage,
  getPublicCoverage,
} from "../src/server/coverage";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";

test("family coverage accepts named subareas, normalizes names and rejects empty, repeated or over-limit input", () => {
  const parsed = coverageSchema.parse({
    areas: [],
    customAreas: [
      {
        cityNodeId: "city:riyadh",
        center: "  مركز أول  ",
        neighborhood: "  حي أول ",
        fee: 3.5,
      },
      { cityNodeId: "city:riyadh", neighborhood: "حي ثان" },
    ],
  });
  assert.equal(parsed.customAreas![0].center, "مركز أول");
  assert.equal(parsed.customAreas![0].neighborhood, "حي أول");
  assert.equal(coverageSchema.parse({ areas: [] }).customAreas, undefined);
  for (const customAreas of [
    [{ cityNodeId: "city:riyadh" }],
    [{ cityNodeId: "city:riyadh", center: "  ", neighborhood: " " }],
    [{ cityNodeId: "city:riyadh", neighborhood: "x".repeat(121) }],
    [{ cityNodeId: "city:riyadh", neighborhood: "حي", fee: -1 }],
    [{ cityNodeId: "city:riyadh", neighborhood: "حي", fee: 1.001 }],
    [
      { cityNodeId: "city:riyadh", center: "Same" },
      { cityNodeId: "city:riyadh", center: " same " },
    ],
    [
      {
        cityNodeId: "city:riyadh",
        neighborhood: "حي",
        producerId: randomUUID(),
      },
    ],
  ])
    assert.equal(
      coverageSchema.safeParse({ areas: [], customAreas }).success,
      false,
    );
  assert.equal(
    coverageSchema.safeParse({
      areas: Array.from({ length: 100 }, (_, i) => ({ nodeId: String(i) })),
      customAreas: [{ cityNodeId: "city:riyadh", neighborhood: "حي" }],
    }).success,
    false,
  );
  assert.equal(
    coverageSchema.safeParse({
      areas: [],
      customAreas: [
        { cityNodeId: "city:a", center: "مركز" },
        { cityNodeId: "city:b", center: "مركز" },
      ],
    }).success,
    true,
  );
});

test("older clients cannot exceed the total limit through preserved subareas", async () => {
  process.env.DATABASE_URL ||= "postgres://unused/coverage_unit_test";
  const calls: string[] = [];
  const stub = mock.method(
    db(),
    "connect",
    async () =>
      ({
        query: async (sql: string) => {
          calls.push(sql);
          return {
            rows: sql.includes("producer_profiles")
              ? [{ id: randomUUID(), customCount: "100" }]
              : [],
          };
        },
        release() {},
      }) as never,
  );
  try {
    await assert.rejects(
      saveCoverage(
        {
          id: randomUUID(),
          name: "Limit fixture",
          phone: "+966500000000",
          role: "producer",
        },
        { areas: [{ nodeId: "city:riyadh" }] },
      ),
      (e: any) => e.status === 400,
    );
    assert.ok(
      calls.some(
        (sql) => sql.includes('AS "customCount"') && sql.includes("FOR UPDATE"),
      ),
    );
    assert.ok(!calls.some((sql) => /DELETE|INSERT/.test(sql)));
    assert.equal(calls.at(-1), "ROLLBACK");
  } finally {
    stub.mock.restore();
  }
});

test(
  "isolated family subareas preserve ownership and legacy data, validate cities before replacing, and publish approved families only",
  {
    skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL,
  },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    const city = (
      await pool.query(
        "SELECT id,city_id,region_id FROM jdatna.coverage_nodes WHERE kind='city' LIMIT 1",
      )
    ).rows[0];
    assert.ok(city, "Run migrations and canonical city seeds first");
    const producerIds = [randomUUID(), randomUUID()];
    const users: SessionUser[] = producerIds.map(() => ({
      id: randomUUID(),
      name: "Custom coverage fixture",
      phone:
        "+966" +
        String(
          BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 10)),
        ).padStart(13, "0"),
      role: "producer",
    }));
    try {
      for (const user of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [user.id, user.name, user.phone, user.role],
        );
      for (let i = 0; i < 2; i++)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'Custom coverage fixture',$4,$5,'approved')",
          [
            producerIds[i],
            users[i].id,
            "custom-coverage-" + producerIds[i],
            city.city_id,
            users[i].phone,
          ],
        );
      await pool.query(
        "INSERT INTO jdatna.delivery_areas(producer_id,city_id,fee) VALUES($1,$2,7.5)",
        [producerIds[0], city.city_id],
      );
      await saveCoverage(users[0], {
        areas: [{ nodeId: city.id, fee: 2 }],
        customAreas: [
          {
            cityNodeId: city.id,
            center: "مركز الأسرة المنتجة",
            neighborhood: "حي أول",
            fee: 12,
          },
          { cityNodeId: city.id, neighborhood: "حي ثان" },
          { cityNodeId: city.id, center: "مركز آخر" },
        ],
      });
      let own = await ownCoverage(users[0]);
      assert.equal(own.customAreas.length, 3);
      assert.ok(
        own.customAreas.some(
          (a) =>
            a.label?.includes("مركز الأسرة المنتجة / حي أول") && a.fee === 12,
        ),
      );
      assert.equal(own.legacyAreas[0].fee, 7.5);
      assert.equal((await ownCoverage(users[1])).customAreas.length, 0);
      await saveCoverage(users[1], {
        areas: [],
        customAreas: [{ cityNodeId: city.id, neighborhood: "حي مستقل" }],
      });
      await saveCoverage(users[0], { areas: [] }); // Older clients preserve newly added subareas.
      own = await ownCoverage(users[0]);
      assert.equal(own.customAreas.length, 3);
      assert.equal((await ownCoverage(users[1])).customAreas.length, 1);
      assert.equal((await getPublicCoverage(producerIds[0])).length, 4); // Three new and one existing legacy range.
      await assert.rejects(
        saveCoverage(users[0], {
          areas: [{ nodeId: city.id }],
          customAreas: [
            {
              cityNodeId: "region:" + city.region_id,
              neighborhood: "غير صالح",
            },
          ],
        }),
      );
      assert.equal((await ownCoverage(users[0])).areas.length, 0); // Validation happened before canonical replacement.
      assert.equal((await ownCoverage(users[0])).customAreas.length, 3);
      await assert.rejects(
        saveCoverage(users[1], {
          producerId: producerIds[0],
          areas: [],
          customAreas: [],
        }),
      );
      const sql =
        "INSERT INTO jdatna.producer_coverage_details(producer_id,city_node_id,center,neighborhood) VALUES($1,$2,$3,$4)";
      await assert.rejects(
        pool.query(sql, [
          producerIds[0],
          "region:" + city.region_id,
          null,
          "حي",
        ]),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        pool.query(sql, [producerIds[0], city.id, null, null]),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        pool.query(sql, [producerIds[0], city.id, "  ", null]),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        pool.query(sql, [producerIds[0], city.id, null, "حي ثان"]),
        (e: any) => e.code === "23505",
      );
      await pool.query(sql, [producerIds[0], city.id, "DuplicateCase", null]);
      await assert.rejects(
        pool.query(sql, [producerIds[0], city.id, "duplicatecase", null]),
        (e: any) => e.code === "23505",
      );
      await pool.query(
        "INSERT INTO jdatna.producer_coverage_details(producer_id,city_node_id,neighborhood) SELECT $1,$2,'Limit fixture '||n FROM generate_series(1,96) n",
        [producerIds[0], city.id],
      );
      assert.equal((await ownCoverage(users[0])).customAreas.length, 100);
      await assert.rejects(
        saveCoverage(users[0], { areas: [{ nodeId: city.id }] }),
        (e: any) => e.status === 400,
      );
      assert.equal((await ownCoverage(users[0])).customAreas.length, 100);
      assert.equal((await ownCoverage(users[0])).areas.length, 0);
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='pending' WHERE id=$1",
        [producerIds[0]],
      );
      assert.deepEqual(await getPublicCoverage(producerIds[0]), []);
      await saveCoverage(users[0], { areas: [], customAreas: [] });
      assert.equal((await ownCoverage(users[0])).customAreas.length, 0);
      assert.equal((await ownCoverage(users[0])).legacyAreas.length, 1);
      assert.equal((await ownCoverage(users[1])).customAreas.length, 1);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.producer_coverage_details WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_coverage WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      await pool.query(
        "DELETE FROM jdatna.delivery_areas WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producerIds],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      await pool.end();
    }
  },
);
