import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { digestMatches, migrationSha256 } from "../src/lib/migration-digest";

const sql = "BEGIN;\nCREATE TABLE x(a int);\nCOMMIT;\n";

test("migration digests accept line-ending-only differences and reject content changes", () => {
  assert.ok(digestMatches(migrationSha256(sql), sql));
  assert.ok(digestMatches(migrationSha256(sql.replace(/\n/g, "\r\n")), sql));
  assert.ok(digestMatches(migrationSha256(sql.replace(/\n$/, "\r\n")), sql));
  assert.ok(digestMatches(migrationSha256(sql.trimEnd()), sql));
  assert.equal(
    digestMatches(migrationSha256(sql.replace("int", "bigint")), sql),
    false,
  );
  assert.equal(
    digestMatches(migrationSha256(sql + "DROP TABLE x;\n"), sql),
    false,
  );
  const legacy = migrationSha256("reviewed original");
  assert.ok(digestMatches(legacy, sql, [legacy]));
});

test("the reviewed legacy checksum list is empty and well-formed", () => {
  const file = JSON.parse(
    readFileSync("migrations/legacy-checksums.json", "utf8"),
  );
  assert.deepEqual(file.accepted, {});
});

test(
  "migrator accepts a production record made from CRLF copies and rejects real drift",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const { db } = await import("../src/server/db");
    const name = (await db().query("SELECT current_database() AS name")).rows[0]
      .name as string;
    assert.ok(name.startsWith("jdatna_test_"));
    const file = "001_phase_one.sql";
    const original = (
      await db().query(
        "SELECT sha256 FROM jdatna.schema_migrations WHERE name=$1",
        [file],
      )
    ).rows[0].sha256 as string;
    const repo = readFileSync("migrations/" + file, "utf8");
    const run = () =>
      execFileSync("node_modules/.bin/tsx", ["scripts/migrate.ts"], {
        env: process.env,
        stdio: "pipe",
      });
    try {
      await db().query(
        "UPDATE jdatna.schema_migrations SET sha256=$2 WHERE name=$1",
        [file, migrationSha256(repo.replace(/\n/g, "\r\n"))],
      );
      assert.doesNotThrow(run, "CRLF-applied production record is accepted");
      await db().query(
        "UPDATE jdatna.schema_migrations SET sha256=$2 WHERE name=$1",
        [file, migrationSha256(repo + "-- drift\n")],
      );
      assert.throws(run, /checksum mismatch/);
    } finally {
      await db().query(
        "UPDATE jdatna.schema_migrations SET sha256=$2 WHERE name=$1",
        [file, original],
      );
    }
  },
);
