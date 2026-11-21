import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { sessionInfo } from "../src/server/auth";
import { hashPassword, passwordLogin } from "../src/server/credentials";

/**
 * فصل «لوحة الإدارة» عن الحساب الشخصي (قرار المالك 2026-11-21، مثل «أي خدمة»):
 * - الدخول واحد، والجلسة الشخصية سنة ولا تفتح أي شيء في الإدارة؛ فيها صاحب الصلاحيات عضو كغيره.
 * - «لوحة الإدارة» بضغطة: جلسة مستقلة 12 ساعة بملف دخول خاص (SameSite=Strict) لمن له صلاحية فقط.
 * - ملف اللوحة لا يُقبل في الموقع، وملف الموقع لا يُقبل في اللوحة.
 * - الخروج من اللوحة يبقي الحساب الشخصي، والخروج من الموقع يغلق الاثنين.
 */
const ORIGIN = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
type Handler = (r: Request, c: unknown) => Promise<Response>;
const call = (
  handler: Handler,
  path: string,
  {
    method = "GET",
    cookies = {},
    referer,
  }: {
    method?: string;
    cookies?: Record<string, string>;
    referer?: string;
  } = {},
) => {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookie) headers.cookie = cookie;
  if (referer) headers.referer = referer;
  return handler(
    new Request(ORIGIN + path, {
      method,
      headers,
      body: method === "GET" ? undefined : "{}",
    }),
    { params: Promise.resolve({}) },
  );
};
const cookieValue = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith(name + "="))
    ?.split(";")[0]
    .slice(name.length + 1) ?? null;

test(
  "the admin panel has its own 12-hour session and the personal session opens nothing in it",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const people = {
      admin: { id: randomUUID(), phone: phone(), role: "admin", perms: [] },
      staff: {
        id: randomUUID(),
        phone: phone(),
        role: "customer",
        perms: ["orders"],
      },
      customer: {
        id: randomUUID(),
        phone: phone(),
        role: "customer",
        perms: [],
      },
    };
    const site: Record<string, string> = {};
    const password = "sep-" + randomUUID().slice(0, 6);
    const ids = Object.values(people).map((p) => p.id);
    const { GET: session } = await import("../src/app/api/session/route");
    const { GET: summary } = await import("../src/app/api/admin/summary/route");
    const { POST: enter } =
      await import("../src/app/api/auth/admin-session/route");
    const { POST: logout } = await import("../src/app/api/logout/route");
    try {
      const passwordHash = await hashPassword(password);
      for (const [key, p] of Object.entries(people)) {
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at,password_hash) VALUES($1,'فصل الإدارة',$2,$3,$4,now(),$5)",
          [p.id, p.phone, p.role, p.perms, passwordHash],
        );
        site[key] = randomBytes(32).toString("hex");
        await pool.query(
          "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [sha(site[key]), p.id],
        );
      }

      // الدخول بكلمة المرور: جلسة شخصية سنة حتى للمدير (الإدارة صارت بجلسة مستقلة).
      delete process.env.ADMIN_LOGIN_OTP;
      const login = await passwordLogin({
        identifier: people.admin.phone,
        password,
      });
      assert.ok(login.token);
      const row = (
        await pool.query(
          "SELECT scope, expires_at > now()+interval '360 days' AS long FROM jdatna.sessions WHERE token_hash=$1",
          [sha(login.token!)],
        )
      ).rows[0];
      assert.deepEqual(row, { scope: "site", long: true });

      // في الموقع: المدير عضو كغيره، بلا صلاحيات، ويظهر له رابط اللوحة فقط.
      const mine = await sessionInfo(
        new Request(ORIGIN + "/api/session", {
          headers: { cookie: `jdatna_session=${site.admin}` },
        }),
      );
      assert.equal(mine?.user.role, "customer");
      assert.deepEqual(mine?.user.permissions, []);
      assert.equal(mine?.user.adminAccess, true);
      const plain = await sessionInfo(
        new Request(ORIGIN + "/api/session", {
          headers: { cookie: `jdatna_session=${site.customer}` },
        }),
      );
      assert.equal(plain?.user.adminAccess, undefined);

      // الجلسة الشخصية لا تفتح مسارات الإدارة.
      for (const who of ["admin", "staff"])
        assert.equal(
          (
            await call(summary, "/api/admin/summary", {
              cookies: { jdatna_session: site[who] },
            })
          ).status,
          401,
          who,
        );

      // فتح اللوحة بضغطة: للمدير والمشرف فقط، وبلا دخول: 401.
      assert.equal(
        (await call(enter, "/api/auth/admin-session", { method: "POST" }))
          .status,
        401,
      );
      assert.equal(
        (
          await call(enter, "/api/auth/admin-session", {
            method: "POST",
            cookies: { jdatna_session: site.customer },
          })
        ).status,
        403,
      );
      const opened = await call(enter, "/api/auth/admin-session", {
        method: "POST",
        cookies: { jdatna_session: site.admin },
      });
      assert.equal(opened.status, 200);
      const panel = cookieValue(opened, "jdatna_admin");
      assert.match(panel ?? "", /^[a-f0-9]{64}$/);
      const header = opened.headers
        .getSetCookie()
        .find((c) => c.startsWith("jdatna_admin="))!;
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      assert.match(header, /Max-Age=43200/);
      // الجلسة الشخصية لم تتغير.
      assert.equal(cookieValue(opened, "jdatna_session"), null);
      const stored = (
        await pool.query(
          "SELECT scope, expires_at BETWEEN now()+interval '11 hours 50 minutes' AND now()+interval '12 hours 1 minute' AS twelve FROM jdatna.sessions WHERE token_hash=$1",
          [sha(panel!)],
        )
      ).rows[0];
      assert.deepEqual(stored, { scope: "admin", twelve: true });

      // ملف اللوحة يفتح الإدارة.
      assert.equal(
        (
          await call(summary, "/api/admin/summary", {
            cookies: { jdatna_admin: panel! },
          })
        ).status,
        200,
      );
      // ولا يُقبل في الموقع، ولا في خانة الجلسة الشخصية.
      const asSite = await (
        await call(session, "/api/session", {
          cookies: { jdatna_admin: panel! },
        })
      ).json();
      assert.equal(asSite.user, null);
      const swapped = await (
        await call(session, "/api/session", {
          cookies: { jdatna_session: panel! },
        })
      ).json();
      assert.equal(swapped.user, null);
      // الملفان معًا: الموقع شخصي، وصفحات اللوحة بجلستها.
      const both = { jdatna_session: site.admin, jdatna_admin: panel! };
      const fromSite = await (
        await call(session, "/api/session", {
          cookies: both,
          referer: ORIGIN + "/orders",
        })
      ).json();
      assert.equal(fromSite.user.role, "customer");
      const fromPanel = await (
        await call(session, "/api/session", {
          cookies: both,
          referer: ORIGIN + "/admin/orders",
        })
      ).json();
      assert.equal(fromPanel.user.role, "admin");
      // صفحة بمسار /admin في موقع آخر لا تُعد من اللوحة.
      const foreign = await (
        await call(session, "/api/session", {
          cookies: both,
          referer: "https://example.com/admin/orders",
        })
      ).json();
      assert.equal(foreign.user.role, "customer");

      // المشرف: تُسحب صلاحياته فتُرفض جلسة لوحته فورًا.
      const staffOpened = await call(enter, "/api/auth/admin-session", {
        method: "POST",
        cookies: { jdatna_session: site.staff },
      });
      const staffPanel = cookieValue(staffOpened, "jdatna_admin")!;
      assert.ok(staffPanel);
      await pool.query("UPDATE jdatna.users SET permissions='{}' WHERE id=$1", [
        people.staff.id,
      ]);
      assert.equal(
        (
          await call(summary, "/api/admin/summary", {
            cookies: { jdatna_admin: staffPanel },
          })
        ).status,
        401,
      );

      // الخروج من اللوحة: تُغلق جلستها وحدها ويبقى الحساب الشخصي.
      const left = await call(logout, "/api/logout", {
        method: "POST",
        cookies: both,
        referer: ORIGIN + "/admin",
      });
      assert.equal(left.status, 200);
      assert.equal(cookieValue(left, "jdatna_session"), null);
      const alive = async (token: string) =>
        (
          await pool.query(
            "SELECT 1 FROM jdatna.sessions WHERE token_hash=$1",
            [sha(token)],
          )
        ).rowCount === 1;
      assert.equal(await alive(panel!), false);
      assert.equal(await alive(site.admin), true);

      // الخروج من الموقع: يُغلق الشخصي وجلسة اللوحة معًا.
      const again = cookieValue(
        await call(enter, "/api/auth/admin-session", {
          method: "POST",
          cookies: { jdatna_session: site.admin },
        }),
        "jdatna_admin",
      )!;
      await call(logout, "/api/logout", {
        method: "POST",
        cookies: { jdatna_session: site.admin, jdatna_admin: again },
      });
      assert.equal(await alive(site.admin), false);
      assert.equal(await alive(again), false);
    } finally {
      await pool
        .query(
          "DELETE FROM jdatna.security_events WHERE user_id=ANY($1::uuid[])",
          [ids],
        )
        .catch(() => {});
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.end();
    }
  },
);
