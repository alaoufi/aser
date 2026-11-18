import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  adminCouriers,
  listCouriers,
  ownCourier,
  reviewCourier,
  saveCourier,
} from "../src/server/couriers";
import { pendingApprovals } from "../src/server/management";
import { startConversation } from "../src/server/chat";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated couriers: private identity, admin approval, visible only to approved families by city, quick chat",
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
    const phone = () =>
      "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const mk = (role: SessionUser["role"], name: string): SessionUser => ({
      id: randomUUID(),
      name,
      phone: phone(),
      role,
    });
    const courier = mk("customer", "مندوب الاختبار"),
      family = mk("producer", "أسرة المندوب"),
      stranger = mk("customer", "عميل عادي"),
      admin = mk("admin", "مدير المندوبين");
    const users = [courier, family, stranger, admin];
    const familyId = randomUUID(),
      doc = randomUUID(),
      otherDoc = randomUUID();
    let courierId: string | undefined;
    try {
      for (const u of users)
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const [city, other] = (
        await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 2")
      ).rows.map((r) => r.id as string);
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المندوب',$4,$5,'approved')",
        [familyId, family.id, "courier-fam-" + familyId, city, family.phone],
      );
      for (const [id, owner, type] of [
        [doc, courier.id, "national_id"],
        [otherDoc, courier.id, "producer_certificate"],
      ])
        await pool.query(
          "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,$3,$4,'image/jpeg',10)",
          [id, owner, type, "test/" + id],
        );
      const input = {
        name: "مندوب الاختبار",
        nationalId: "١٠٢٣٤٥٦٧٨٩",
        documentId: doc,
        carType: "كامري 2020",
        cityId: city,
      };
      // صورة الهوية لازمة، ومن نوع الهوية، ومن صاحب الحساب.
      await assert.rejects(
        saveCourier(courier, { ...input, documentId: otherDoc }),
        { status: 400 },
      );
      await assert.rejects(
        saveCourier(courier, { ...input, nationalId: "123" }),
      );
      const saved = await saveCourier(courier, input);
      courierId = saved.id;
      assert.equal(saved.status, "pending");
      const after = { ...courier, role: "courier" as const };
      assert.equal(
        (
          await pool.query("SELECT role FROM jdatna.users WHERE id=$1", [
            courier.id,
          ])
        ).rows[0].role,
        "courier",
      );
      // رقم الهوية مشفّر في القاعدة، ويُقرأ لصاحبه والإدارة فقط.
      const raw = (
        await pool.query(
          "SELECT national_id_encrypted FROM jdatna.courier_profiles WHERE id=$1",
          [courierId],
        )
      ).rows[0].national_id_encrypted as Buffer;
      assert.ok(!raw.toString("utf8").includes("1023456789"));
      assert.equal((await ownCourier(after))?.nationalId, "1023456789");
      assert.ok((await pendingApprovals(admin)).count >= 1);

      // قبل الاعتماد: لا يظهر للأسرة ولا للعميل.
      assert.equal(
        (await listCouriers(family, { city })).some((k) => k.id === courierId),
        false,
      );
      // العميل يتصفح «تجمع المندوبين» (العامين المعتمدين فقط).
      assert.equal(
        (await listCouriers(stranger, { city })).some(
          (k) => k.id === courierId,
        ),
        false,
      );
      await assert.rejects(adminCouriers(family), { status: 403 });
      const pending = (await adminCouriers(admin)).find(
        (k) => k.id === courierId,
      );
      assert.equal(pending?.nationalId, "1023456789");
      await assert.rejects(
        reviewCourier(after, courierId, {
          decision: "approved",
          reason: "اعتماد ذاتي",
        }),
        { status: 403 },
      );
      await reviewCourier(admin, courierId, {
        decision: "approved",
        reason: "تم الاعتماد، أهلًا بك",
      });

      assert.ok(
        (await listCouriers(stranger, { city })).some(
          (k) => k.id === courierId,
        ),
      );
      // بعد الاعتماد: يظهر للأسرة في مدينته، ولا يظهر في مدينة أخرى، ولا تظهر هويته.
      const card = (await listCouriers(family, { city })).find(
        (k) => k.id === courierId,
      );
      assert.equal(card?.carType, "كامري 2020");
      assert.equal(card?.phone, courier.phone);
      assert.ok(!("nationalId" in (card ?? {})));
      if (other)
        assert.equal(
          (await listCouriers(family, { city: other })).some(
            (k) => k.id === courierId,
          ),
          false,
        );
      // تغيير السيارة لا يعيد المراجعة؛ إخفاء الاتصال يخفي الرقم.
      await saveCourier(after, {
        ...input,
        carType: "هايلكس",
        showPhone: false,
      });
      const updated = (await listCouriers(family, { city })).find(
        (k) => k.id === courierId,
      );
      assert.equal(updated?.carType, "هايلكس");
      assert.equal(updated?.phone, null);
      assert.equal(updated?.whatsapp, courier.phone);
      // تغيير الهوية يعيد المراجعة فيختفي حتى يُعتمد.
      await saveCourier(after, { ...input, nationalId: "1023456780" });
      assert.equal(
        (await listCouriers(family, { city })).some((k) => k.id === courierId),
        false,
      );
      await reviewCourier(admin, courierId, {
        decision: "approved",
        reason: "اعتماد بعد التحديث",
      });

      // محادثة سريعة: الأسرة تفتحها مع المندوب، والعميل كذلك من «تجمع المندوبين» (محادثة منفصلة).
      const conversation = await startConversation(family, {
        courier: courier.id,
      });
      assert.ok(conversation.id);
      assert.equal(
        (await startConversation(family, { courier: courier.id })).id,
        conversation.id,
        "same conversation reopened",
      );
      const withCustomer = await startConversation(stranger, {
        courier: courier.id,
      });
      assert.notEqual(withCustomer.id, conversation.id);
      assert.equal(
        (
          await pool.query(
            "SELECT courier_id,producer_id FROM jdatna.conversations WHERE id=$1",
            [withCustomer.id],
          )
        ).rows[0].courier_id,
        courier.id,
      );
      // المندوب لا يبدأ محادثة من «التجمع»؛ يراسل العميل من طلب التوصيل.
      await assert.rejects(startConversation(after, { courier: courier.id }), {
        status: 403,
      });
    } finally {
      await pool.query("DELETE FROM jdatna.conversations WHERE courier_id=$1", [
        courier.id,
      ]);
      await pool.query(
        "DELETE FROM jdatna.messages WHERE conversation_id IN (SELECT id FROM jdatna.conversations WHERE producer_id=$1)",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.conversations WHERE producer_id=$1",
        [familyId],
      );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [users.map((u) => u.id)],
      );
      await pool.query("DELETE FROM jdatna.courier_profiles WHERE user_id=$1", [
        courier.id,
      ]);
      await pool.query(
        "DELETE FROM jdatna.producer_documents WHERE id=ANY($1::uuid[])",
        [[doc, otherDoc]],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users.map((u) => u.id),
      ]);
      if (prior === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY;
      else process.env.DOCUMENT_ENCRYPTION_KEY = prior;
    }
  },
);
