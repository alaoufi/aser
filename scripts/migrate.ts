import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { db } from "../src/server/db";
import { categories, cities } from "../src/server/constants";
async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "DATABASE_URL required: use dedicated migration credentials",
    );
  const client = await db().connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('jdatna.migrations'))",
    );
    if (
      !(await client.query("SELECT 1 FROM pg_namespace WHERE nspname='jdatna'"))
        .rowCount
    )
      throw new Error(
        "Administrator must create schema jdatna owned by the migration role before migration",
      );
    await client.query(
      "CREATE TABLE IF NOT EXISTS jdatna.schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir("migrations"))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(join("migrations", name), "utf8");
      const digest = createHash("sha256").update(sql).digest("hex");
      const existing = (
        await client.query(
          "SELECT sha256 FROM jdatna.schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (existing) {
        if (existing.sha256 !== digest)
          throw new Error("Migration checksum mismatch: " + name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(
          sql.replace(/^\s*BEGIN;\s*/i, "").replace(/COMMIT;\s*$/i, ""),
        );
        await client.query(
          "INSERT INTO jdatna.schema_migrations(name,sha256) VALUES($1,$2)",
          [name, digest],
        );
        await client.query("COMMIT");
        console.log("Applied " + name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await client.query("BEGIN");
    try {
      await client.query(
        'INSERT INTO jdatna.regions(id,name) SELECT DISTINCT "regionId","regionName" FROM json_to_recordset($1::json) AS x("regionId" text,"regionName" text) ON CONFLICT DO NOTHING',
        [JSON.stringify(cities)],
      );
      await client.query(
        'INSERT INTO jdatna.cities(id,name,region_id) SELECT id,name,"regionId" FROM json_to_recordset($1::json) AS x(id text,name text,"regionId" text) ON CONFLICT DO NOTHING',
        [JSON.stringify(cities)],
      );
      await client.query(
        "INSERT INTO jdatna.categories(id,name,slug,icon) SELECT id,name,slug,icon FROM json_to_recordset($1::json) AS x(id text,name text,slug text,icon text) ON CONFLICT DO NOTHING",
        [JSON.stringify(categories)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('jdatna.migrations'))",
    );
    client.release();
    await db().end();
  }
}
main().catch((error) => {
  console.error("Migration failed", {
    code: error?.code ?? "unknown",
    message:
      error instanceof Error
        ? error.message.replace(
            /postgres(?:ql)?:\/\/[^\s]+/g,
            "[redacted database URL]",
          )
        : "Unknown error",
  });
  process.exitCode = 1;
});
