import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { deleteAccount, isDeleted } from "../src/server/account";
import { sendMessage, startConversation } from "../src/server/chat";

test(
  "isolated account deletion: everything of the account is deleted in-app except conversations kept for disputes, last admin is kept",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: "customer" | "producer" | "admin", name: string) => ({
      id: randomUUID(),
      name,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const customer = mk("customer", "عميل يحذف حسابه"),
      family = mk("producer", "أسرة تحذف حسابها");
    const familyId = randomUUID(),
      productId = randomUUID(),
      orderId = randomUUID(),
      slug = "delete-" + familyId.slice(0, 8);
    const users = [customer.id, family.id];
    try {
      for (const u of [customer, family])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,username) VALUES($1,$2,$3,$4,now(),$5)",
          [u.id, u.name, u.phone, u.role, "u" + u.id.slice(0, 8)],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status,description) VALUES($1,$2,$3,'مطبخ الحذف',$4,$5,'approved','وصف')",
        [familyId, family.id, slug, city, family.phone],
      );
      await pool.query(
        "INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible) VALUES($1,$2,'طبق','وصف','meal','available',true)",
        [productId, familyId],
      );
      await pool.query(
        "INSERT INTO jdatna.order_requests(id,request_key,request_hash,user_id,producer_id,product_id,snapshot,customer_name,phone,quantity,meal,start_date,end_date,notes) VALUES($1,$2,'h',$3,$4,$5,'{}',$6,$7,1,'lunch',current_date+1,current_date+1,'بدون بصل')",
        [
          orderId,
          randomUUID(),
          customer.id,
          familyId,
          productId,
          customer.name,
          customer.phone,
        ],
      );
      const { id: chat } = await startConversation(customer, {
        producer: slug,
      });
      await sendMessage(customer, chat, { body: "رقمي الخاص 0555" });
      await pool.query(
        "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [randomUUID(), customer.id],
      );

      await assert.rejects(deleteAccount(customer, { confirm: "نعم" }), {
        status: 400,
      });
      assert.deepEqual(
        await deleteAccount(customer, { confirm: "  حذف حسابي " }),
        { deleted: true },
      );
      assert.equal(await isDeleted(customer.id), true);
      const u = (
        await pool.query(
          "SELECT name,phone,username,password_hash,suspended_at FROM jdatna.users WHERE id=$1",
          [customer.id],
        )
      ).rows[0];
      assert.equal(u.name, customer.name + " (حساب محذوف)");
      assert.equal(u.phone, "deleted:" + customer.id);
      assert.equal(u.username, null);
      assert.ok(u.suspended_at);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.sessions WHERE user_id=$1",
            [customer.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.order_requests WHERE id=$1",
            [orderId],
          )
        ).rows[0].n,
        0,
        "his orders are deleted",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT body FROM jdatna.messages WHERE conversation_id=$1",
            [chat],
          )
        ).rows[0].body,
        "رقمي الخاص 0555",
        "conversations stay as they were for disputes",
      );
      await assert.rejects(deleteAccount(customer, { confirm: "حذف حسابي" }), {
        status: 404,
      });

      // الأسرة: منتجاتها وعروضها وطلباتها تُحذف، ويبقى سطرها مخفيًا لربط محادثاتها.
      const offerId = randomUUID();
      await pool.query(
        `INSERT INTO jdatna.offers(id,producer_id,product_id,title,description,terms,price,audience,meal,starts_at,ends_at,enabled) VALUES($1,$2,$3,'عرض','','شروط',15,'students','lunch',now(),now()+interval '1 day',true)`,
        [offerId, familyId, productId],
      );
      await deleteAccount(family, { confirm: "حذف حسابي" });
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.offers WHERE producer_id=$1",
            [familyId],
          )
        ).rows[0].n,
        0,
      );
      const profile = (
        await pool.query(
          "SELECT status,name,phone,description FROM jdatna.producer_profiles WHERE id=$1",
          [familyId],
        )
      ).rows[0];
      assert.deepEqual(profile, {
        status: "suspended",
        name: "أسرة محذوفة",
        phone: "—",
        description: "",
      });
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.products WHERE producer_id=$1",
            [familyId],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.messages WHERE conversation_id=$1",
            [chat],
          )
        ).rows[0].n,
        1,
      );

      // المدير الوحيد لا يحذف نفسه حتى يعيّن غيره.
      const admins = (
        await pool.query(
          "SELECT id,name,phone,role FROM jdatna.users WHERE role='admin' AND suspended_at IS NULL AND deleted_at IS NULL",
        )
      ).rows;
      if (admins.length === 1)
        await assert.rejects(
          deleteAccount(admins[0], { confirm: "حذف حسابي" }),
          { status: 409 },
        );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=$1",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.order_requests WHERE producer_id=$1",
        [familyId],
      );
      await pool.query("DELETE FROM jdatna.products WHERE producer_id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [users],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.end();
    }
  },
);
