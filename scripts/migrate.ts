import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../src/server/db";
import { categories, cities } from "../src/server/constants";
import { digestMatches, migrationSha256 } from "../src/lib/migration-digest";
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
    const legacy: Record<string, string[]> = JSON.parse(
      await readFile(join("migrations", "legacy-checksums.json"), "utf8"),
    ).accepted;
    for (const name of (await readdir("migrations"))
      .filter((n) => /^\d+.*\.sql$/.test(n))
      .sort()) {
      const sql = await readFile(join("migrations", name), "utf8");
      const digest = migrationSha256(sql);
      const existing = (
        await client.query(
          "SELECT sha256 FROM jdatna.schema_migrations WHERE name=$1",
          [name],
        )
      ).rows[0];
      if (existing) {
        if (!digestMatches(existing.sha256, sql, legacy[name] ?? []))
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
      let categorySeeds = [...categories];
      const seeded = new Set<string>();
      while (categorySeeds.length) {
        const level = categorySeeds.filter(
          (c) => !c.parentId || seeded.has(c.parentId),
        );
        if (!level.length)
          throw new Error(
            "Category seed hierarchy contains an orphan or cycle",
          );
        await client.query(
          'INSERT INTO jdatna.categories(id,name,slug,icon,parent_id) SELECT id,name,slug,icon,"parentId" FROM json_to_recordset($1::json) AS x(id text,name text,slug text,icon text,"parentId" text) ON CONFLICT DO NOTHING',
          [JSON.stringify(level)],
        );
        for (const category of level) seeded.add(category.id);
        categorySeeds = categorySeeds.filter((c) => !seeded.has(c.id));
      }
      // Lookup seeds run after migrations on clean installations. Preserve curated parents.
      await client.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,region_id) SELECT 'region:'||id,'region',name,id FROM jdatna.regions ON CONFLICT DO NOTHING",
      );
      await client.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id,city_id) SELECT 'city:'||id,'city',name,'region:'||region_id,region_id,id FROM jdatna.cities ON CONFLICT DO NOTHING",
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
