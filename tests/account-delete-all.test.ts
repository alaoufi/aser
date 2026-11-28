import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

/**
 * حذف الحساب يحذف كل بيانات العضو ومتعلقاته وإضافاته وطلباته (طلب المالك 2026-11-23):
 * «دليلي» له وهو عند الآخرين، طلباته المنشورة، اهتماماته، دعواته، اقتراحاته، أجهزة إشعاراته،
 * ومشاهداته. والمندوب: ملفه وهويته المشفرة ومستنداته (كان الحذف يفشل بسبب صورة هويته).
 * والأسرة: هويتها البصرية وخطط اشتراكها، وظهورها في «دليلي» عند الآخرين.
 */
test(
  "account deletion removes every related record: directory, requests, interests, invites, devices, courier profile",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { deleteAccount, isDeleted } = await import("../src/server/account");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const ph = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const ids: string[] = [];
    const mk = async (role: string, name: string) => {
      const id = randomUUID();
      const phone = ph();
      ids.push(id);
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [id, name, phone, role],
      );
      return {
        id,
        name,
        phone,
        role,
      } as never as import("../src/lib/types").SessionUser;
    };
    const count = async (sql: string, args: unknown[]) =>
      Number(
        (await pool.query(`SELECT count(*)::int AS n FROM ${sql}`, args))
          .rows[0].n,
      );
    const city = (
      await pool.query(
        "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
      )
    ).rows[0].id;
    const category = (
      await pool.query("SELECT id FROM jdatna.categories LIMIT 1")
    ).rows[0].id;
    try {
      const customer = await mk("customer", "عميل يحذف");
      const friend = await mk("customer", "صديق");
      const courier = await mk("courier", "مندوب يحذف");
      const familyUser = await mk("producer", "أسرة تحذف");
      const family = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ يحذف',$4,$5,'approved')",
        [family, familyUser.id, "del-all-" + family.slice(0, 8), city, ph()],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_brand(producer_id,palette) VALUES($1,'olive')",
        [family],
      );
      // العميل: دليله، طلبه المنشور، اهتماماته، دعوته، اقتراحه، جهازه.
      await pool.query(
        "INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,producer_id) VALUES($1,$2,'family','مطبخ',$3)",
        [randomUUID(), customer.id, family],
      );
      await pool.query(
        "INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,phone) VALUES($1,$2,'contact','أبو فهد','0551234567')",
        [randomUUID(), customer.id],
      );
      // العميل في «دليلي» عند الأسرة.
      await pool.query(
        "INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,customer_id) VALUES($1,$2,'customer','عميل',$3)",
        [randomUUID(), familyUser.id, customer.id],
      );
      await pool.query(
        "INSERT INTO jdatna.customer_requests(id,user_id,body,city_id) VALUES($1,$2,'جريش لعشرة',$3)",
        [randomUUID(), customer.id, city],
      );
      await pool.query(
        "INSERT INTO jdatna.member_interests(user_id,category_id) VALUES($1,$2)",
        [customer.id, category],
      );
      await pool.query(
        "INSERT INTO jdatna.referrals(referred_id,referrer_id,via) VALUES($1,$2,'link')",
        [friend.id, customer.id],
      );
      await pool.query(
        "INSERT INTO jdatna.suggestions(id,user_id,body) VALUES($1,$2,'اقتراح')",
        [randomUUID(), customer.id],
      );
      await pool.query(
        "INSERT INTO jdatna.apns_devices(token,user_id) VALUES($1,$2)",
        [randomBytes(32).toString("hex"), customer.id],
      );
      // المندوب: ملفه يشير إلى صورة هويته، وهو في «دليلي» عند العميل الآخر.
      const doc = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'national_id',$3,'image/jpeg',100)",
        [doc, courier.id, "test/" + doc],
      );
      const courierProfile = randomUUID();
      await pool.query(
        "INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,document_id,national_id_encrypted) VALUES($1,$2,'مندوب',$3,'sedan',$4,'enc')",
        [courierProfile, courier.id, city, doc],
      );
      await pool.query(
        "INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,courier_id) VALUES($1,$2,'courier','مندوب',$3)",
        [randomUUID(), friend.id, courierProfile],
      );

      await deleteAccount(customer, { confirm: "DELETE" });
      assert.equal(await isDeleted(customer.id), true);
      for (const [sql, label] of [
        [
          "jdatna.directory_entries WHERE owner_id=$1 OR customer_id=$1",
          "دليلي",
        ],
        ["jdatna.customer_requests WHERE user_id=$1", "طلباته المنشورة"],
        ["jdatna.member_interests WHERE user_id=$1", "اهتماماته"],
        ["jdatna.referrals WHERE referrer_id=$1 OR referred_id=$1", "دعواته"],
        ["jdatna.suggestions WHERE user_id=$1", "اقتراحاته"],
        ["jdatna.apns_devices WHERE user_id=$1", "أجهزته"],
      ] as const)
        assert.equal(await count(sql, [customer.id]), 0, label);

      await deleteAccount(courier, { confirm: "DELETE" });
      assert.equal(await isDeleted(courier.id), true);
      assert.equal(
        await count("jdatna.courier_profiles WHERE user_id=$1", [courier.id]),
        0,
        "ملف المندوب وهويته",
      );
      assert.equal(
        await count("jdatna.producer_documents WHERE user_id=$1", [courier.id]),
        0,
        "صورة الهوية",
      );
      assert.equal(
        await count("jdatna.directory_entries WHERE owner_id=$1", [friend.id]),
        0,
        "المندوب في دليل غيره",
      );

      // الأسرة في «دليلي» عند صديق، ثم تحذف حسابها.
      await pool.query(
        "INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,producer_id) VALUES($1,$2,'family','مطبخ',$3)",
        [randomUUID(), friend.id, family],
      );
      await deleteAccount(familyUser, { confirm: "DELETE" });
      assert.equal(
        await count(
          "jdatna.directory_entries WHERE producer_id=$1 OR owner_id=$2",
          [family, familyUser.id],
        ),
        0,
        "الأسرة في دليل غيرها ودليلها",
      );
      assert.equal(
        await count("jdatna.producer_brand WHERE producer_id=$1", [family]),
        0,
        "هويتها البصرية",
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.directory_entries WHERE owner_id=ANY($1::uuid[])",
        [ids],
      );
      // لو فشل الاختبار في منتصفه: لا تبقى سطور تُفسد اختبارات المندوبين.
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_documents WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE user_id=ANY($1::uuid[])",
        [ids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        ids,
      ]);
      await pool.end();
    }
  },
);
