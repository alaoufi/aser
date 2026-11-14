import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ownContactVisibility,
  saveContactVisibility,
} from "../src/server/management";
import { getProducer } from "../src/server/catalog";
import { db } from "../src/server/db";
import type { SessionUser } from "../src/lib/types";

test(
  "isolated contact visibility: the family shows or hides phone and WhatsApp, and hidden numbers never reach visitors",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const owner: SessionUser = {
      id: randomUUID(),
      name: "أسرة التواصل",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "producer",
    };
    const familyId = randomUUID(),
      slug = "contact-" + familyId;
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
        [owner.id, owner.name, owner.phone, owner.role],
      );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة التواصل',$4,$5,'approved')",
        [familyId, owner.id, slug, city, owner.phone],
      );
      // الافتراضي: الجوال وواتساب ظاهران، وواتساب على رقم الجوال إن لم يُسجَّل رقم آخر.
      assert.deepEqual(await ownContactVisibility(owner), {
        showPhone: true,
        showWhatsapp: true,
        phone: owner.phone,
        whatsapp: null,
      });
      let visible = await getProducer(slug);
      assert.equal(visible?.phone, owner.phone);
      assert.equal(visible?.whatsapp, owner.phone);
      // إخفاء الجوال يبقي واتساب.
      await saveContactVisibility(owner, {
        showPhone: false,
        showWhatsapp: true,
      });
      visible = await getProducer(slug);
      assert.equal(visible?.phone, null);
      assert.equal(visible?.whatsapp, owner.phone);
      // إخفاء الاثنين: لا رقم يصل للزائر، والأسرة تبقى معتمدة.
      await saveContactVisibility(owner, {
        showPhone: false,
        showWhatsapp: false,
      });
      visible = await getProducer(slug);
      assert.equal(visible?.phone, null);
      assert.equal(visible?.whatsapp, null);
      assert.equal(
        (
          await pool.query(
            "SELECT status FROM jdatna.producer_profiles WHERE id=$1",
            [familyId],
          )
        ).rows[0].status,
        "approved",
      );
      await assert.rejects(saveContactVisibility(owner, { showPhone: true }));
    } finally {
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [owner.id]);
    }
  },
);
