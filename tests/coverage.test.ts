import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coverageSchema,
  nodeSchema,
  validCoverageParent,
  requireCoverageAdmin,
} from "../src/server/coverage";
import { mock } from "node:test";
import { randomUUID } from "node:crypto";
const integrationEnabled =
  process.env.JDATNA_TEST_DB === "true" && Boolean(process.env.DATABASE_URL);
import { db } from "../src/server/db";
import {
  saveCoverage,
  curateCoverage,
  getPublicCoverage,
  ownCoverage,
  getCoverageTree,
} from "../src/server/coverage";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  phone: "+966500000000",
  name: "Test",
  role: "producer" as const,
};
test("hierarchy permits only real administrative parent levels", () => {
  assert.equal(validCoverageParent("governorate", "region"), true);
  assert.equal(validCoverageParent("city", "governorate"), true);
  assert.equal(validCoverageParent("neighborhood", "city"), true);
  // الحي داخل نطاق المدينة والمركز خارجه: الحي الجديد يتبع المدينة فقط.
  assert.equal(validCoverageParent("neighborhood", "center"), false);
  assert.equal(validCoverageParent("center", "region"), false);
  assert.equal(validCoverageParent("city", "city"), false);
});
test("multiple coverage picks support legacy cities without invented parents", () => {
  assert.equal(
    coverageSchema.parse({
      areas: [
        { nodeId: "city:riyadh", fee: null },
        { nodeId: "city:jeddah", fee: 12.5 },
      ],
    }).areas.length,
    2,
  );
  assert.throws(() =>
    coverageSchema.parse({
      areas: [{ nodeId: "city:riyadh" }, { nodeId: "city:riyadh" }],
    }),
  );
  assert.throws(() =>
    coverageSchema.parse({ areas: [{ nodeId: "city:riyadh", fee: -1 }] }),
  );
  assert.throws(() => coverageSchema.parse({ areas: [], producerId: "other" }));
});
test("curation requires explicit parent and existing city reference", () => {
  assert.throws(() =>
    nodeSchema.parse({ kind: "city", parentId: "x", name: "Invented" }),
  );
  assert.throws(() =>
    nodeSchema.parse({ kind: "region", name: "X", parentId: "x" }),
  );
  assert.equal(
    nodeSchema.parse({ kind: "city", parentId: "gov:x", cityId: "riyadh" })
      .cityId,
    "riyadh",
  );
});
test("curation rejects nonadministrators independently of routing", () => {
  assert.throws(() => requireCoverageAdmin({ role: "producer" }));
  assert.doesNotThrow(() => requireCoverageAdmin({ role: "admin" }));
});
test("coverage region ordering follows Riyadh Makkah Madinah Qassim while preserving descendants", async () => {
  process.env.DATABASE_URL ||= "postgres://unused/coverage_unit_test";
  const regions = ["qassim", "madinah", "makkah", "riyadh"];
  const rows = regions.flatMap((regionId) => [
    {
      id: "region:" + regionId,
      regionId,
      kind: "region",
      name: regionId,
      label: regionId,
    },
    {
      id: "city:" + regionId,
      regionId,
      kind: "city",
      name: regionId,
      label: regionId + " / child",
    },
  ]);
  const stub = mock.method(db(), "query", async () => ({ rows }));
  try {
    const tree = await getCoverageTree();
    assert.deepEqual(
      tree.filter((n) => n.kind === "region").map((n) => n.regionId),
      ["riyadh", "makkah", "madinah", "qassim"],
    );
    assert.deepEqual(
      tree.slice(0, 2).map((n) => n.id),
      ["region:riyadh", "city:riyadh"],
    );
  } finally {
    stub.mock.restore();
  }
});
test("family save derives owner from session and never rewrites legacy delivery areas", async () => {
  process.env.DATABASE_URL ||= "postgres://unused/coverage_unit_test";
  const calls: { sql: string; args: unknown[] }[] = [];
  const client = {
    query: async (sql: string, args: unknown[] = []) => {
      calls.push({ sql, args });
      return {
        rows: sql.includes("FROM jdatna.producer_profiles")
          ? [{ id: "owned" }]
          : sql.startsWith("SELECT id FROM jdatna.coverage_nodes")
            ? [{ id: "city:riyadh" }]
            : [],
      };
    },
    release: () => {},
  };
  const stub = mock.method(db(), "connect", async () => client as never);
  try {
    await saveCoverage(user, { areas: [{ nodeId: "city:riyadh", fee: null }] });
    assert.deepEqual(
      calls.find((c) => c.sql.includes("FROM jdatna.producer_profiles"))?.args,
      [user.id],
    );
    assert.ok(
      calls
        .filter((c) => /DELETE|INSERT/.test(c.sql))
        .every((c) => c.args[0] === "owned"),
    );
    assert.ok(!calls.some((c) => c.sql.includes("delivery_areas")));
    assert.equal(calls.at(-1)?.sql, "COMMIT");
  } finally {
    stub.mock.restore();
  }
});
test("missing owner and region-only selection roll back before any coverage deletion", async () => {
  for (const owner of [false, true]) {
    const calls: string[] = [];
    const stub = mock.method(
      db(),
      "connect",
      async () =>
        ({
          query: async (sql: string) => {
            calls.push(sql);
            return {
              rows:
                owner && sql.includes("producer_profiles")
                  ? [{ id: "owned" }]
                  : [],
            };
          },
          release: () => {},
        }) as never,
    );
    try {
      await assert.rejects(
        saveCoverage(user, { areas: [{ nodeId: "region:riyadh" }] }),
      );
      assert.ok(!calls.some((s) => s.startsWith("DELETE")));
      assert.equal(calls.at(-1), "ROLLBACK");
    } finally {
      stub.mock.restore();
    }
  }
});
test("curating city rejects cross-region and already mapped city", async () => {
  for (const city of [
    { region_id: "other", parent_id: "region:other" },
    { region_id: "riyadh", parent_id: "existing-governorate" },
  ]) {
    const calls: string[] = [];
    const stub = mock.method(
      db(),
      "connect",
      async () =>
        ({
          query: async (sql: string) => {
            calls.push(sql);
            return {
              rows: sql.includes("FOR SHARE")
                ? [{ id: "gov", kind: "governorate", region_id: "riyadh" }]
                : sql.includes("FOR UPDATE")
                  ? [city]
                  : [],
            };
          },
          release: () => {},
        }) as never,
    );
    try {
      await assert.rejects(
        curateCoverage(
          { ...user, role: "admin" },
          { kind: "city", cityId: "riyadh", parentId: "gov" },
        ),
      );
      assert.ok(!calls.some((s) => s.startsWith("UPDATE")));
    } finally {
      stub.mock.restore();
    }
  }
});
test("public coverage queries constrain both new and legacy coverage to approved family", async () => {
  const queries: string[] = [];
  const stub = mock.method(db(), "query", async (sql: string) => {
    queries.push(sql);
    return { rows: [] };
  });
  try {
    assert.deepEqual(await getPublicCoverage(user.id), []);
    assert.equal(queries.length, 2);
    assert.ok(queries.every((s) => s.includes("p.status='approved'")));
  } finally {
    stub.mock.restore();
  }
});
test(
  "isolated PostgreSQL curated coverage, ownership, legacy retention and SQL constraints",
  { skip: !integrationEnabled },
  async () => {
    const pool = db();
    const name = (await pool.query("SELECT current_database() AS name")).rows[0]
      .name;
    assert.ok(
      name.startsWith("jdatna_test_"),
      "Requires dedicated jdatna_test_ database",
    );
    const suffix = randomUUID();
    const regionId = "coverage-region-" + suffix,
      cityId = "coverage-city-" + suffix;
    const regionNode = "region:" + regionId,
      cityNode = "city:" + cityId;
    const users = [0, 1, 2].map((i) => ({
      ...user,
      id: randomUUID(),
      phone:
        "+966" +
        String(
          BigInt("0x" + randomUUID().replaceAll("-", "").slice(0, 10)),
        ).padStart(13, "0"),
      role: i === 2 ? ("admin" as const) : ("producer" as const),
    }));
    const producers = [randomUUID(), randomUUID()];
    const created: string[] = [];
    try {
      await pool.query("INSERT INTO jdatna.regions(id,name) VALUES($1,$2)", [
        regionId,
        regionId,
      ]);
      await pool.query(
        "INSERT INTO jdatna.cities(id,name,region_id) VALUES($1,$2,$3)",
        [cityId, cityId, regionId],
      );
      await pool.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,region_id) VALUES($1,'region',$2,$3)",
        [regionNode, regionId, regionId],
      );
      await pool.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id,city_id) VALUES($1,'city',$2,$3,$4,$5)",
        [cityNode, cityId, regionNode, regionId, cityId],
      );
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, "Coverage integration", u.phone, u.role],
        );
      for (let i = 0; i < 2; i++)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'Coverage integration',$4,$5,'approved')",
          [
            producers[i],
            users[i].id,
            "coverage-" + producers[i],
            cityId,
            users[i].phone,
          ],
        );
      await pool.query(
        "INSERT INTO jdatna.delivery_areas(producer_id,city_id,fee) VALUES($1,$2,7.50)",
        [producers[0], cityId],
      );
      assert.equal(
        (await getCoverageTree()).find((n) => n.id === cityNode)?.legacy,
        true,
      );
      await saveCoverage(users[0], { areas: [{ nodeId: cityNode, fee: 2 }] });
      const gov = (
        await curateCoverage(users[2], {
          kind: "governorate",
          parentId: regionNode,
          name: "Test governorate",
        })
      ).id;
      created.push(gov);
      await curateCoverage(users[2], { kind: "city", parentId: gov, cityId });
      assert.equal(
        (await getCoverageTree()).find((n) => n.id === cityNode)?.legacy,
        false,
      );
      const center = (
        await curateCoverage(users[2], {
          kind: "center",
          parentId: cityNode,
          name: "Test center",
        })
      ).id;
      created.push(center);
      await assert.rejects(
        curateCoverage(users[2], {
          kind: "neighborhood",
          parentId: center,
          name: "Neighborhood under center",
        }),
        { status: 400 },
      );
      const neighborhood = (
        await curateCoverage(users[2], {
          kind: "neighborhood",
          parentId: cityNode,
          name: "Test neighborhood",
        })
      ).id;
      created.push(neighborhood);
      await saveCoverage(users[0], {
        areas: [
          { nodeId: center, fee: 12.5 },
          { nodeId: neighborhood, fee: null },
        ],
      });
      assert.equal((await ownCoverage(users[0])).areas.length, 2);
      assert.equal((await ownCoverage(users[1])).areas.length, 0);
      await assert.rejects(
        saveCoverage(users[1], { producerId: producers[0], areas: [] }),
      );
      assert.equal((await ownCoverage(users[0])).areas.length, 2);
      assert.equal((await ownCoverage(users[0])).legacyAreas[0].fee, 7.5);
      const publicAreas = await getPublicCoverage(producers[0]);
      assert.equal(publicAreas.length, 3);
      assert.ok(
        publicAreas
          .find((a) => a.nodeId === neighborhood)
          ?.label?.includes("Test governorate"),
      );
      assert.ok(publicAreas.some((a) => a.nodeId === "legacy:" + cityId));
      await pool.query(
        "UPDATE jdatna.producer_profiles SET status='suspended' WHERE id=$1",
        [producers[0]],
      );
      assert.deepEqual(await getPublicCoverage(producers[0]), []);
      await assert.rejects(
        curateCoverage(users[0], {
          kind: "governorate",
          parentId: regionNode,
          name: "Forbidden",
        }),
      );
      await assert.rejects(
        curateCoverage(users[2], {
          kind: "center",
          parentId: gov,
          name: "Invalid",
        }),
      );
      await assert.rejects(
        pool.query(
          "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id) VALUES($1,'center','Invalid SQL parent',$2,$3)",
          [randomUUID(), gov, regionId],
        ),
        (e: unknown) => (e as { code: string }).code === "23514",
      );
      await assert.rejects(
        pool.query(
          "UPDATE jdatna.coverage_nodes SET parent_id=$2 WHERE id=$1",
          [center, regionNode],
        ),
        (e: unknown) => (e as { code: string }).code === "23514",
      );
      await assert.rejects(
        saveCoverage(users[0], { areas: [{ nodeId: gov }] }),
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.producer_coverage WHERE producer_id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query(
        "DELETE FROM jdatna.delivery_areas WHERE producer_id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producers],
      );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [users.map((u) => u.id)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      // Child-first cleanup removes only this fixture's nodes, never seeded geography.
      for (const id of created.toReversed().filter((id) => id !== created[0]))
        await pool.query("DELETE FROM jdatna.coverage_nodes WHERE id=$1", [id]);
      await pool.query("DELETE FROM jdatna.coverage_nodes WHERE id=$1", [
        cityNode,
      ]);
      if (created[0])
        await pool.query("DELETE FROM jdatna.coverage_nodes WHERE id=$1", [
          created[0],
        ]);
      await pool.query("DELETE FROM jdatna.coverage_nodes WHERE id=$1", [
        regionNode,
      ]);
      await pool.query("DELETE FROM jdatna.cities WHERE id=$1", [cityId]);
      await pool.query("DELETE FROM jdatna.regions WHERE id=$1", [regionId]);
      await pool.end();
    }
  },
);
