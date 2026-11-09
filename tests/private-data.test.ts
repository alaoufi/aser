import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNationalId, profileSchema } from "../src/server/validation";
import {
  mergeProducerPrivate,
  saveProfile,
  ownProfile,
  adminProducers,
  reviewProducer,
} from "../src/server/management";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../src/server/db";
import { hash } from "../src/server/auth";
import { decryptDocument } from "../src/server/security";
import { getProducer, searchProducers } from "../src/server/catalog";
import { GET as ownRoute } from "../src/app/api/producer/profile/route";
import { GET as adminRoute } from "../src/app/api/admin/producers/route";
import type { SessionUser } from "../src/lib/types";
const basic = () => ({
  name: "أسرة الاختبار",
  phone: "0501234567",
  cityId: "riyadh",
  documentType: "producer_certificate",
  documentId: randomUUID(),
});
test("national IDs normalize Arabic and Persian digits and enforce exactly ten digits", () => {
  assert.equal(normalizeNationalId(" ١٢٣٤٥٦٧٨٩٠ "), "1234567890");
  assert.equal(normalizeNationalId("۱۲۳۴۵۶۷۸۹۰"), "1234567890");
  for (const value of ["123456789", "12345678901", "12345abcde", "123 4567890"])
    assert.throws(() => normalizeNationalId(value));
});
test("new private identity is required, legacy omission retained, partial updates preserve the other field", () => {
  assert.throws(() => mergeProducerPrivate(null, {}, true), { status: 400 });
  assert.throws(
    () => mergeProducerPrivate(null, { nationalId: "1234567890" }, true),
    { status: 400 },
  );
  assert.equal(mergeProducerPrivate(null, {}, false), null);
  const existing = { nationalId: "1234567890", workLocation: "عنوان خاص سابق" };
  assert.deepEqual(mergeProducerPrivate(existing, {}, false), existing);
  assert.deepEqual(
    mergeProducerPrivate(existing, { workLocation: "عنوان خاص جديد" }, false),
    { ...existing, workLocation: "عنوان خاص جديد" },
  );
});
test("basic profile permits omitted advanced values without injecting destructive edit defaults", () => {
  const parsed = profileSchema.parse({
    ...basic(),
    nationalId: "١٢٣٤٥٦٧٨٩٠",
    workLocation: "عنوان العمل الخاص",
  });
  assert.equal(parsed.nationalId, "1234567890");
  for (const key of [
    "description",
    "categoryIds",
    "delivery",
    "pickup",
    "socialLinks",
    "businessHours",
    "deliveryAreas",
  ] as const)
    assert.equal(parsed[key], undefined);
  assert.equal(
    profileSchema.safeParse({ ...basic(), delivery: false, pickup: false })
      .success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...basic(), workLocation: "" }).success,
    false,
  );
});
test(
  "isolated family identity is encrypted, owner/admin only, omitted advanced data preserved and legacy records retained",
  { skip: process.env.JDATNA_TEST_DB !== "true" || !process.env.DATABASE_URL },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS name")).rows[0].name,
      /^jdatna_test_/,
    );
    assert.ok(
      /^[0-9a-f]{64}$/i.test(process.env.DOCUMENT_ENCRYPTION_KEY ?? ""),
      "Isolated encryption key must be configured",
    );
    const userIds = [randomUUID(), randomUUID(), randomUUID()],
      docIds = [randomUUID(), randomUUID()],
      producerIds: string[] = [];
    const users: SessionUser[] = userIds.map((id, i) => ({
      id,
      name: "private data fixture",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: i === 2 ? "admin" : "customer",
    }));
    const tokens = users.map(() => randomBytes(32).toString("hex"));
    const location = "private-work-location-" + randomUUID();
    const req = (path: string, i: number) =>
      new Request("http://localhost" + path, {
        headers: { cookie: "jdatna_session=" + tokens[i] },
      });
    try {
      const city = (
        await pool.query("SELECT id FROM jdatna.cities ORDER BY id LIMIT 1")
      ).rows[0].id;
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [user.id, user.name, user.phone, user.role],
        );
        await pool.query(
          "INSERT INTO jdatna.sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [hash(tokens[i]), user.id],
        );
        if (i < 2)
          await pool.query(
            "INSERT INTO jdatna.producer_documents(id,user_id,type,object_key,mime,size) VALUES($1,$2,'producer_certificate',$3,'application/pdf',10)",
            [docIds[i], user.id, "private-fixture-" + docIds[i]],
          );
      }
      const base = {
        ...basic(),
        cityId: city,
        phone: users[0].phone,
        documentId: docIds[0],
      };
      await assert.rejects(saveProfile(users[0], base), { status: 400 });
      await assert.rejects(
        saveProfile(users[0], { ...base, nationalId: "1234567890" }),
        { status: 400 },
      );
      await assert.rejects(
        saveProfile(users[0], {
          ...base,
          nationalId: "1234567890",
          workLocation: location,
          phone: users[1].phone,
        }),
        { status: 400 },
      );
      await assert.rejects(
        saveProfile(users[0], {
          ...base,
          nationalId: "1234567890",
          workLocation: location,
          documentId: docIds[1],
        }),
        { status: 400 },
      );
      // أول تسجيل يتطلب قسمًا؛ التعديلات اللاحقة بدونه تحفظ الأقسام كما هي.
      await assert.rejects(
        saveProfile(users[0], {
          ...base,
          nationalId: "1234567890",
          workLocation: location,
        }),
        /قسمًا واحدًا/,
      );
      const saved = await saveProfile(users[0], {
        ...base,
        nationalId: "١٢٣٤٥٦٧٨٩٠",
        workLocation: location,
        categoryIds: ["12"],
      });
      producerIds.push(saved.id);
      const own = await ownProfile(users[0]);
      assert.equal(own.nationalId, "1234567890");
      assert.equal(own.workLocation, location);
      assert.deepEqual(own.categoryIds, ["12"]);
      assert.equal(own.delivery, false);
      assert.equal(own.pickup, true);
      assert.equal(own.status, "pending");
      const privateRow = (
        await pool.query(
          "SELECT encrypted_payload FROM jdatna.producer_private WHERE producer_id=$1",
          [saved.id],
        )
      ).rows[0];
      assert.ok(Buffer.isBuffer(privateRow.encrypted_payload));
      assert.equal(
        privateRow.encrypted_payload.includes(Buffer.from("1234567890")),
        false,
      );
      assert.equal(
        privateRow.encrypted_payload.includes(Buffer.from(location)),
        false,
      );
      assert.deepEqual(
        JSON.parse(
          decryptDocument(
            privateRow.encrypted_payload,
            Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY!, "hex"),
          ).toString(),
        ),
        { version: 1, nationalId: "1234567890", workLocation: location },
      );
      assert.equal("encrypted_payload" in own, false);
      const other = await ownRoute(
        req("/api/producer/profile?producerId=" + saved.id, 1),
        {},
      );
      assert.equal((await other.json()).profile, null);
      await assert.rejects(adminProducers(users[1]), { status: 403 });
      const denied = await adminRoute(req("/api/admin/producers", 1), {});
      assert.equal(denied.status, 403);
      const admin = await adminRoute(req("/api/admin/producers", 2), {});
      assert.equal(admin.status, 200);
      const adminEntry = (await admin.json()).producers.find(
        (profile: { id: string }) => profile.id === saved.id,
      );
      assert.equal(adminEntry.nationalId, "1234567890");
      assert.equal(adminEntry.workLocation, location);
      assert.equal("encrypted_payload" in adminEntry, false);
      await reviewProducer(users[2], saved.id, {
        decision: "approved",
        reason: "مراجعة أهلية اختبار معزول",
        eligibilityConfirmed: true,
      });
      const publicFamily = await getProducer(own.slug);
      assert.ok(publicFamily);
      const publicJSON = JSON.stringify([
        publicFamily,
        ...(await searchProducers({ city, q: base.name })),
      ]);
      for (const secret of [
        location,
        "1234567890",
        "nationalId",
        "workLocation",
        "encrypted_payload",
      ])
        assert.equal(publicJSON.includes(secret), false);
      const advanced = {
        ...base,
        description: "وصف الأسرة المنتجة الموجود",
        neighborhood: "حي موجود",
        whatsapp: users[0].phone,
        delivery: true,
        pickup: false,
        categoryIds: ["1", "2"],
        socialLinks: [
          {
            platform: "instagram",
            url: "https://instagram.com/private_fixture",
          },
        ],
        website: "https://example.com",
        businessHours: [{ day: 1, opens: "09:00", closes: "18:00" }],
        deliveryAreas: [{ cityId: city, fee: 7 }],
        documentNumber: "license-previous",
        documentExpiresAt: "2035-12-31",
      };
      await saveProfile(users[0], advanced);
      await saveProfile(users[0], {
        ...base,
        name: "اسم الأسرة المنتجة المعدل",
      });
      const retained = await ownProfile(users[0]);
      assert.equal(retained.description, advanced.description);
      assert.equal(retained.neighborhood, advanced.neighborhood);
      assert.equal(retained.whatsapp, advanced.whatsapp);
      assert.equal(retained.delivery, true);
      assert.equal(retained.pickup, false);
      assert.deepEqual(retained.categoryIds.sort(), ["1", "2"]);
      assert.equal(retained.socialLinks.length, 2);
      assert.deepEqual(retained.businessHours, advanced.businessHours);
      assert.equal(Number(retained.deliveryAreas[0].fee), 7);
      assert.equal(retained.documentNumber, "license-previous");
      assert.equal(retained.documentExpiresAt.slice(0, 10), "2035-12-31");
      assert.equal(retained.nationalId, "1234567890");
      assert.equal(retained.workLocation, location);
      const unchanged = (
        await pool.query(
          "SELECT encrypted_payload FROM jdatna.producer_private WHERE producer_id=$1",
          [saved.id],
        )
      ).rows[0].encrypted_payload;
      assert.ok(
        privateRow.encrypted_payload.equals(unchanged),
        "Omitted identity does not rewrite encrypted payload",
      );
      await saveProfile(users[0], {
        ...base,
        workLocation: location + "-updated",
      });
      const changed = await ownProfile(users[0]);
      assert.equal(changed.nationalId, "1234567890");
      assert.equal(changed.workLocation, location + "-updated");
      await saveProfile(users[0], {
        ...base,
        description: "",
        neighborhood: null,
        whatsapp: null,
        delivery: false,
        pickup: true,
        categoryIds: ["12"],
        socialLinks: [],
        businessHours: [],
        deliveryAreas: [],
        documentNumber: null,
        documentExpiresAt: null,
      });
      const cleared = await ownProfile(users[0]);
      assert.equal(cleared.description, "");
      assert.equal(cleared.neighborhood, null);
      assert.equal(cleared.whatsapp, null);
      assert.deepEqual(cleared.categoryIds, ["12"]);
      assert.deepEqual(cleared.socialLinks, []);
      assert.deepEqual(cleared.businessHours, []);
      assert.deepEqual(cleared.deliveryAreas, []);
      assert.equal(cleared.documentNumber, null);
      // Existing profiles without private data are not fabricated or erased on compatible old-client edits.
      const legacyId = randomUUID();
      producerIds.push(legacyId);
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,description,city_id,phone,delivery,pickup,status) VALUES($1,$2,$3,'Legacy family','Legacy description',$4,$5,true,false,'approved')",
        [
          legacyId,
          users[1].id,
          "private-legacy-" + legacyId,
          city,
          users[1].phone,
        ],
      );
      await pool.query(
        "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,'2')",
        [legacyId],
      );
      await saveProfile(users[1], {
        ...basic(),
        cityId: city,
        phone: users[1].phone,
        documentId: docIds[1],
      });
      const legacy = await ownProfile(users[1]);
      assert.equal(legacy.nationalId, null);
      assert.equal(legacy.workLocation, null);
      assert.equal(legacy.description, "Legacy description");
      assert.equal(legacy.delivery, true);
      assert.equal(legacy.pickup, false);
      assert.deepEqual(legacy.categoryIds, ["2"]);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=ANY($1::uuid[])",
        [userIds],
      );
      await pool.query(
        "DELETE FROM jdatna.producer_verifications WHERE producer_id=ANY($1::uuid[])",
        [producerIds],
      );
      for (const table of [
        "producer_categories",
        "producer_social_links",
        "business_hours",
        "delivery_areas",
      ])
        await pool.query(
          `DELETE FROM jdatna.${table} WHERE producer_id=ANY($1::uuid[])`,
          [producerIds],
        );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [producerIds],
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM jdatna.producer_private WHERE producer_id=ANY($1::uuid[])",
            [producerIds],
          )
        ).rows[0].count,
        0,
      );
      await pool.query(
        "DELETE FROM jdatna.producer_documents WHERE id=ANY($1::uuid[])",
        [docIds],
      );
      await pool.query(
        "DELETE FROM jdatna.sessions WHERE user_id=ANY($1::uuid[])",
        [userIds],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        userIds,
      ]);
      await pool.end();
    }
  },
);
