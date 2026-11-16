import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/server/db";

/** كل مسارات /api/admin، بكل طرقها، تُقفل أمام الزائر والعميل والأسرة والمندوب. */
function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

test(
  "every admin API route and method refuses visitors and non-admin accounts",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const people = (["customer", "producer", "courier"] as const).map(
      (role) => ({
        id: randomUUID(),
        role,
        phone:
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        token: randomBytes(32).toString("hex"),
      }),
    );
    try {
      for (const p of people) {
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,'غير مدير',$2,$3,now())",
          [p.id, p.phone, p.role],
        );
        await pool.query(
          "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [createHash("sha256").update(p.token).digest("hex"), p.id],
        );
      }
      const files = routes(join(process.cwd(), "src/app/api/admin"));
      assert.ok(files.length >= 20);
      const failures: string[] = [];
      let checked = 0;
      for (const file of files) {
        const mod = (await import(file)) as Record<
          string,
          (r: Request, c: unknown) => Promise<Response>
        >;
        const path = file
          .slice(file.indexOf("/api/"))
          .replace("/route.ts", "")
          .replace(/\[(\w+)\]/g, randomUUID());
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
          const handler = mod[method];
          if (typeof handler !== "function") continue;
          for (const who of [null, ...people]) {
            const url = `http://127.0.0.1:3000${path}?q=`;
            const headers: Record<string, string> = {
              origin: process.env.APP_ORIGIN || "http://127.0.0.1:3000",
              "content-type": "application/json",
            };
            if (who) headers.cookie = `jdatna_session=${who.token}`;
            const response = await handler(
              new Request(url, {
                method,
                headers,
                body: method === "GET" ? undefined : "{}",
              }),
              {
                params: Promise.resolve(
                  new Proxy({}, { get: () => randomUUID() }),
                ),
              },
            );
            checked++;
            const expected = who ? [401, 403] : [401];
            if (!expected.includes(response.status))
              failures.push(
                `${method} ${path} as ${who?.role ?? "visitor"} → ${response.status}`,
              );
          }
        }
      }
      assert.ok(checked > 100, `checked ${checked}`);
      assert.deepEqual(failures, []);
    } finally {
      await pool.query("DELETE FROM jdatna.sessions WHERE user_id=ANY($1)", [
        people.map((p) => p.id),
      ]);
      await pool.query(
        "DELETE FROM jdatna.security_events WHERE user_id=ANY($1)",
        [people.map((p) => p.id)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [
        people.map((p) => p.id),
      ]);
    }
  },
);
