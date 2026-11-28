import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { deleteAccount } from "../src/server/account";
import { saveFamilyCourier } from "../src/server/couriers";

test(
  "a family with a private courier can delete its account: the courier is stopped and kept, nothing is rolled back",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const digits = () =>
      String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const family = {
      id: randomUUID(),
      name: "أسرة بمندوب خاص",
      phone: "+9665" + digits(),
      role: "producer" as const,
    };
    const courierLocal = "05" + digits();
    const courierPhone = "+966" + courierLocal.slice(1);
    const familyId = randomUUID();
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [family.id, family.name, family.phone, family.role],
      );
      const city = (
        await pool.query(
          "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ المندوب',$4,$5,'approved')",
        [
          familyId,
          family.id,
          "del-courier-" + familyId.slice(0, 8),
          city,
          family.phone,
        ],
      );
      await saveFamilyCourier(family, {
        name: "مندوب الأسرة",
        phone: courierLocal,
        nationality: "سعودي",
        vehicle: "motorcycle",
        pledge: true,
      });
      // لا محادثات ولا بلاغات: كان حذف سطر الأسرة يفشل بسبب ربط المندوب الخاص به.
      assert.deepEqual(await deleteAccount(family, { confirm: "حذف حسابي" }), {
        deleted: true,
      });
      const courier = (
        await pool.query(
          "SELECT k.status,k.active FROM jdatna.courier_profiles k JOIN jdatna.users u ON u.id=k.user_id WHERE u.phone=$1",
          [courierPhone],
        )
      ).rows[0];
      assert.deepEqual(courier, { status: "suspended", active: false });
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=$1",
            [familyId],
          )
        ).rows[0]?.status,
        "suspended",
      );
      assert.ok(
        (
          await pool.query("SELECT deleted_at FROM jdatna.users WHERE id=$1", [
            family.id,
          ])
        ).rows[0].deleted_at,
      );
    } finally {
      const courierUser = (
        await pool.query("SELECT id FROM jdatna.users WHERE phone=$1", [
          courierPhone,
        ])
      ).rows[0]?.id;
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE family_id=$1",
        [familyId],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [[family.id, courierUser].filter(Boolean)],
      );
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [[family.id, courierUser].filter(Boolean)],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [family.id, courierUser].filter(Boolean),
      ]);
    }
  },
);
