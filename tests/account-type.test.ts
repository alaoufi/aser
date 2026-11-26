import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";

/**
 * قرار المالك 2026-11-26: العميل يتحول إلى أسرة والعكس (من «معلوماتي» ومن الإدارة)، والمدير يعدّل
 * جوال العضو. الأسرة إلى عميل: صفحتها ومنتجاتها مخفية محفوظة، وتعود كما كانت عند رجوعها أسرة.
 */
test(
  "members switch between customer and family both ways, and the admin edits phone and type",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { changeMyAccountType } = await import("../src/server/account-type");
    const { updateMember } = await import("../src/server/members");
    const { getProducer } = await import("../src/server/catalog");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const users: string[] = [];
    const mk = async (role: string) => {
      const u = { id: randomUUID(), name: role, phone: phone(), role };
      users.push(u.id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [u.id, u.name, u.phone, u.role],
      );
      return u as SessionUser;
    };
    const role = async (id: string) =>
      (await pool.query("SELECT role FROM jdatna.users WHERE id=$1", [id]))
        .rows[0].role;
    const profileId = randomUUID();
    try {
      const admin = await mk("admin");
      const customer = await mk("customer");
      const family = await mk("producer");
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      const slug = "type-test-" + profileId;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة التحويل',$4,$5,'approved')",
        [profileId, family.id, slug, city, family.phone],
      );
      assert.ok(await getProducer(slug));

      // عميل بلا ملف أسرة: «سجّل أسرتك» يفتح التسجيل.
      assert.deepEqual(await changeMyAccountType(customer, "family"), {
        type: "family",
        register: true,
      });
      assert.equal(await role(customer.id), "customer");

      // الأسرة إلى عميل: ملفها مغلق ومخفي، ومحفوظ بحالته.
      await changeMyAccountType(family, "customer");
      assert.equal(await role(family.id), "customer");
      const closed = (
        await pool.query(
          "SELECT status,closed_from FROM jdatna.producer_profiles WHERE id=$1",
          [profileId],
        )
      ).rows[0];
      assert.deepEqual(closed, { status: "closed", closed_from: "approved" });
      assert.equal(await getProducer(slug), null, "مخفية عن العملاء");

      // تعود أسرة كما كانت.
      assert.deepEqual(await changeMyAccountType(family, "family"), {
        type: "family",
        register: false,
      });
      assert.equal(await role(family.id), "producer");
      assert.ok(await getProducer(slug), "عادت ظاهرة");
      await assert.rejects(changeMyAccountType(family, "courier"), {
        status: 400,
      });

      // الإدارة: نوع الحساب.
      await updateMember(admin, {
        action: "type",
        id: family.id,
        type: "customer",
      });
      assert.equal(await role(family.id), "customer");
      await updateMember(admin, {
        action: "type",
        id: family.id,
        type: "family",
      });
      assert.equal(await role(family.id), "producer");
      await assert.rejects(
        updateMember(admin, {
          action: "type",
          id: customer.id,
          type: "family",
        }),
        { status: 400 },
        "لا ملف أسرة: يسجّل من «معلوماتي»",
      );

      // الإدارة: الجوال، ولا يتكرر، ويتبعه جوال ملف الأسرة.
      const fresh = phone();
      await updateMember(admin, {
        action: "phone",
        id: family.id,
        phone: "0" + fresh.slice(4),
      });
      assert.equal(
        (
          await pool.query("SELECT phone FROM jdatna.users WHERE id=$1", [
            family.id,
          ])
        ).rows[0].phone,
        fresh,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT phone FROM jdatna.producer_profiles WHERE id=$1",
            [profileId],
          )
        ).rows[0].phone,
        fresh,
      );
      await assert.rejects(
        updateMember(admin, { action: "phone", id: customer.id, phone: fresh }),
        { status: 409 },
      );
      // غير المدير العام لا يعدّل.
      await assert.rejects(
        updateMember(customer, {
          action: "phone",
          id: family.id,
          phone: phone(),
        }),
        { status: 403 },
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[]) OR target_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        profileId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
