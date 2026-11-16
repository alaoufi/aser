import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  familyCouriers,
  listCouriers,
  ownCourier,
  saveCourier,
  saveFamilyCourier,
  stopFamilyCourier,
} from "../src/server/couriers";
import { moderateConversation, startConversation } from "../src/server/chat";
import { adminReports } from "../src/server/admin";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated family courier: the family registers it with a pledge, no admin approval, visible to that family only; chat reports name the reported person",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const prior = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!/^[a-f0-9]{64}$/i.test(prior ?? ""))
      process.env.DOCUMENT_ENCRYPTION_KEY = "c".repeat(64);
    const digits = () =>
      String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = (
      role: SessionUser["role"],
      name: string,
      permissions: string[] = [],
    ): SessionUser => ({
      id: randomUUID(),
      name,
      phone: "+9665" + digits(),
      role,
      permissions,
    });
    const famUser = mk("producer", "أسرة المندوب الخاص"),
      otherFamUser = mk("producer", "أسرة أخرى"),
      pendingFamUser = mk("producer", "أسرة غير معتمدة"),
      customer = mk("customer", "عميل يصير مندوبًا"),
      chatCustomer = mk("customer", "عميل مزعج"),
      general = mk("courier", "مندوب عام"),
      admin = mk("admin", "مدير");
    const users = [
      famUser,
      otherFamUser,
      pendingFamUser,
      customer,
      chatCustomer,
      general,
      admin,
    ];
    const fam = randomUUID(),
      otherFam = randomUUID(),
      pendingFam = randomUUID(),
      generalProfile = randomUUID();
    const newPhoneLocal = "05" + digits();
    const newPhone = "+966" + newPhoneLocal.slice(1);
    const created: string[] = [];
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
          [u.id, u.name, u.phone, u.role, u.permissions ?? []],
        );
      const city = (
        await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
      ).rows[0].id as string;
      for (const [id, u, status] of [
        [fam, famUser, "approved"],
        [otherFam, otherFamUser, "approved"],
        [pendingFam, pendingFamUser, "pending"],
      ] as const)
        await pool.query(
          "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,trade_name,city_id,phone,status) VALUES($1,$2,$3,$4,$4,$5,$6,$7)",
          [id, u.id, "fc-" + id, u.name, city, u.phone, status],
        );
      // مندوب عام معتمد (بهوية) في مدينة الأسرة.
      await pool.query(
        "INSERT INTO jdatna.courier_profiles(id,user_id,name,city_id,car_type,national_id_encrypted,status,approved_at) VALUES($1,$2,$3,$4,'هايلكس',$5,'approved',now())",
        [generalProfile, general.id, general.name, city, Buffer.from("x")],
      );
      const pledge = {
        name: "مندوب الأسرة",
        phone: newPhoneLocal,
        vehicle: "car" as const,
        carModel: "سوناتا 2019",
        carColor: "أبيض",
        pledge: true,
      };
      // السيارة تحتاج نوعها ولونها؛ الدباب لا.
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, carColor: undefined }),
        /لون السيارة/,
      );
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, vehicle: "truck" }),
      );

      // للأسر المعتمدة فقط، والتعهد إلزامي، وجوال الأسرة نفسها مرفوض.
      await assert.rejects(saveFamilyCourier(pendingFamUser, pledge), {
        status: 403,
      });
      await assert.rejects(saveFamilyCourier(customer, pledge), {
        status: 403,
      });
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, pledge: false }),
      );
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, phone: famUser.phone }),
        { status: 409 },
      );

      // جوال جديد بأي صيغة: حساب مندوب معتمد فورًا، خاص بالأسرة، بلا هوية ولا كلمة مرور.
      const saved = await saveFamilyCourier(famUser, {
        ...pledge,
        phone: " " + newPhoneLocal.replace(/^0/, "+966 ") + " ",
      });
      created.push(saved.userId);
      assert.equal(saved.status, "approved");
      const row = (
        await pool.query(
          `SELECT u.phone,u.role,u.password_hash,k.status,k.family_id,k.pledged_by,k.national_id_encrypted,
             k.vehicle,k.car_model,k.car_color,k.car_type
           FROM jdatna.courier_profiles k JOIN jdatna.users u ON u.id=k.user_id WHERE k.id=$1`,
          [saved.id],
        )
      ).rows[0];
      assert.equal(row.vehicle, "car");
      assert.equal(row.car_model, "سوناتا 2019");
      assert.equal(row.car_color, "أبيض");
      assert.equal(row.car_type, "سيارة سوناتا 2019 · أبيض");
      // تعديل المركبة إلى دباب: لا نوع ولا لون للسيارة.
      await saveFamilyCourier(famUser, {
        name: pledge.name,
        phone: newPhoneLocal,
        vehicle: "motorcycle",
        pledge: true,
      });
      const bike = (
        await pool.query(
          "SELECT vehicle,car_model,car_color,car_type FROM jdatna.courier_profiles WHERE id=$1",
          [saved.id],
        )
      ).rows[0];
      assert.deepEqual(bike, {
        vehicle: "motorcycle",
        car_model: null,
        car_color: null,
        car_type: "دباب",
      });
      assert.equal(row.phone, newPhone);
      assert.equal(row.role, "courier");
      assert.equal(row.password_hash, null);
      assert.equal(row.status, "approved");
      assert.equal(row.family_id, fam);
      assert.equal(row.pledged_by, famUser.id);
      assert.equal(row.national_id_encrypted, null);
      // لا يدخل طلب الاعتماد عند الإدارة.
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.courier_profiles WHERE status='pending' AND family_id=$1",
            [fam],
          )
        ).rows[0].n,
        0,
      );

      // يظهر لأسرته فقط، بشارة اسم الأسرة، والعام يظهر للأسرتين.
      const mine = await listCouriers(famUser, {});
      const priv = mine.find((k) => k.userId === saved.userId);
      assert.ok(priv, "المندوب الخاص يظهر لأسرته");
      assert.equal(priv.familyName, famUser.name);
      assert.ok(mine.some((k) => k.userId === general.id));
      const others = await listCouriers(otherFamUser, {});
      assert.equal(
        others.some((k) => k.userId === saved.userId),
        false,
        "لا يظهر لأسرة أخرى",
      );
      assert.ok(others.some((k) => k.userId === general.id));
      assert.equal(
        (await familyCouriers(famUser)).couriers.find((k) => k.id === saved.id)
          ?.joined,
        false,
      );

      // لوحة المندوب نفسه: الشارة، ولا يعدّل بياناته بنموذج المندوب العام.
      const courierUser: SessionUser = {
        id: saved.userId,
        name: pledge.name,
        phone: newPhone,
        role: "courier",
      };
      assert.equal((await ownCourier(courierUser))?.familyName, famUser.name);
      await assert.rejects(
        saveCourier(courierUser, {
          name: "x y",
          nationalId: "1000000000",
          documentId: randomUUID(),
          carType: "aa",
          cityId: city,
        }),
        { status: 409 },
      );

      // جوال مسجل لعميل: يتحول لمندوب خاص ويبقى حسابه.
      const converted = await saveFamilyCourier(famUser, {
        ...pledge,
        name: "عميل صار مندوبًا",
        phone: customer.phone,
      });
      assert.equal(converted.userId, customer.id);
      assert.equal(
        (
          await pool.query("SELECT role FROM jdatna.users WHERE id=$1", [
            customer.id,
          ])
        ).rows[0].role,
        "courier",
      );
      // مرفوض: مندوب عام، أو مندوب خاص لأسرة أخرى، أو أسرة منتجة، أو إدارة.
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, phone: general.phone }),
        { status: 409 },
      );
      await assert.rejects(
        saveFamilyCourier(otherFamUser, { ...pledge, phone: newPhoneLocal }),
        { status: 409 },
      );
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, phone: otherFamUser.phone }),
        { status: 409 },
      );
      await assert.rejects(
        saveFamilyCourier(famUser, { ...pledge, phone: admin.phone }),
        { status: 409 },
      );

      // الأسرة توقفه فيختفي من الإسناد، وتعيده بتسجيل جواله مرة أخرى.
      await assert.rejects(stopFamilyCourier(otherFamUser, { id: saved.id }), {
        status: 404,
      });
      await stopFamilyCourier(famUser, { id: saved.id });
      assert.equal(
        (await listCouriers(famUser, {})).some(
          (k) => k.userId === saved.userId,
        ),
        false,
      );
      await saveFamilyCourier(famUser, pledge);
      assert.ok(
        (await listCouriers(famUser, {})).some(
          (k) => k.userId === saved.userId,
        ),
      );
      // إيقاف الإدارة لا تلغيه الأسرة.
      await pool.query(
        "UPDATE jdatna.courier_profiles SET status='suspended',reviewer_id=$2 WHERE id=$1",
        [saved.id, admin.id],
      );
      await assert.rejects(saveFamilyCourier(famUser, pledge), {
        status: 403,
      });
      assert.equal(
        (await familyCouriers(famUser)).couriers.find((k) => k.id === saved.id)
          ?.stoppedByAdmin,
        true,
      );

      // بلاغ المحادثة: الإدارة ترى المبلِّغ والمبلَّغ عنه بالاسم والسبب.
      const conv = await startConversation(chatCustomer, {
        producer: "fc-" + fam,
      });
      await moderateConversation(famUser, conv.id, {
        action: "report",
        reason: "رسائل مزعجة متكررة بعد رفض الطلب",
        block: true,
      });
      const report = (await adminReports(admin)).find(
        (r) => r.producerId === fam,
      );
      assert.ok(report);
      assert.equal(report.reportedName, chatCustomer.name);
      assert.equal(report.reporterName, famUser.name);
      assert.equal(report.reportedIsFamily, false);
      assert.match(report.reason, /رسائل مزعجة/);
    } finally {
      const all = [...users.map((u) => u.id), ...created];
      await pool.query(
        "DELETE FROM jdatna.reports WHERE reporter_id=ANY($1::uuid[])",
        [all],
      );
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE customer_id=ANY($1::uuid[]))",
        [all],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE customer_id=ANY($1::uuid[])",
        [all],
      );
      await pool.query(
        "DELETE FROM jdatna.courier_profiles WHERE user_id=ANY($1::uuid[])",
        [all],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [[fam, otherFam, pendingFam]],
      );
      await pool.query(
        "DELETE FROM jdatna.rate_limits WHERE key LIKE ANY($1::text[])",
        [all.map((id) => "%" + id + "%")],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        all,
      ]);
      if (prior === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
      else process.env.DOCUMENT_ENCRYPTION_KEY = prior;
    }
  },
);
