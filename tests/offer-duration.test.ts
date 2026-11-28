import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../src/lib/types";

/**
 * مدة صلاحية العرض (طلب المالك 2026-11-23): بالساعات أو «دائم». إذا انتهى العرض يختفي من العامة،
 * ويبقى في «عروض أسرتي» بإحصائياته (مرات الظهور، والطلبات بالعرض).
 */
test("offer validity: permanent stays, expired hides, statistics remain", async (t) => {
  const { offerSchema, offerVisible } = await import("../src/server/offers");
  const base = {
    title: "عرض",
    description: "",
    terms: "شروط",
    audience: "general",
    meal: "lunch",
    startsAt: "2026-11-01T00:00:00Z",
    enabled: true,
  };
  // دائم: بلا نهاية.
  assert.equal(offerSchema.parse({ ...base, endsAt: null }).endsAt, null);
  assert.equal(offerSchema.parse(base).endsAt, null);
  const row = {
    ...base,
    producerStatus: "approved",
    endsAt: null as string | null,
  };
  assert.equal(offerVisible(row, [], new Date("2030-01-01")), true, "الدائم");
  assert.equal(
    offerVisible(
      { ...row, endsAt: "2026-11-01T05:00:00Z" },
      [],
      new Date("2026-11-01T06:00:00Z"),
    ),
    false,
    "انتهت ساعاته",
  );

  if (process.env.JDATNA_TEST_DB !== "true") return t.skip("no test db");
  const { db } = await import("../src/server/db");
  const { saveOffer, listOffers, ownOffers } =
    await import("../src/server/offers");
  const pool = db();
  assert.match(
    (await pool.query("SELECT current_database() AS n")).rows[0].n,
    /^jdatna_test_/,
  );
  const userId = randomUUID();
  const family = randomUUID();
  const city = (
    await pool.query(
      "SELECT id FROM jdatna.cities WHERE id !~ '^[0-9a-f]{8}-' LIMIT 1",
    )
  ).rows[0].id;
  const user = {
    id: userId,
    name: "أسرة العروض",
    phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
    role: "producer",
  } as SessionUser;
  try {
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
      [userId, user.name, user.phone],
    );
    await pool.query(
      "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'مطبخ العروض',$4,$5,'approved')",
      [family, userId, "offer-dur-" + family.slice(0, 8), city, user.phone],
    );
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const forever = await saveOffer(
      user,
      { ...base, title: "دائم", startsAt: iso(now - 3_600_000), endsAt: null },
      false,
    );
    const hours = await saveOffer(
      user,
      {
        ...base,
        title: "ثلاث ساعات",
        startsAt: iso(now - 3_600_000),
        endsAt: iso(now + 2 * 3_600_000),
      },
      false,
    );
    const shown = async (viewer = "0123456789abcdef") =>
      (await listOffers(null, "", null, viewer)).filter((o) =>
        [forever.id, hours.id].includes(o.id),
      );
    assert.equal((await shown()).length, 2, "الاثنان ظاهران");
    // ظهرت مرة: تُعدّ.
    let own = await ownOffers(user);
    // (اختبارات أخرى تعرض العروض بالتوازي، فالعدّ «على الأقل».)
    const once = own.find((o) => o.id === hours.id)?.views ?? 0;
    assert.ok(once >= 1);
    // الزائر نفسه في اليوم نفسه لا يُعدّ مرة أخرى، وصاحب العرض لا يُعدّ أبدًا.
    await shown();
    await listOffers(user, "", null, "fedcba9876543210");
    own = await ownOffers(user);
    assert.equal(own.find((o) => o.id === hours.id)?.views, once);
    assert.equal(own.find((o) => o.id === forever.id)?.state, "active");

    // انتهت ساعات العرض (نقدّم الزمن بتعديل البداية والنهاية إلى الماضي).
    await pool.query(
      "UPDATE jdatna.offers SET starts_at=now()-interval '5 hours',ends_at=now()-interval '2 hours' WHERE id=$1",
      [hours.id],
    );
    const before = await ownOffers(user);
    // زائر آخر: يُعدّ للدائم، ولا يُعدّ للمنتهي.
    const after = await shown("1111111111111111");
    assert.deepEqual(
      after.map((o) => o.id),
      [forever.id],
      "المنتهي يختفي والدائم يبقى",
    );
    own = await ownOffers(user);
    const expired = own.find((o) => o.id === hours.id);
    assert.equal(expired?.state, "expired", "يبقى في عروض الأسرة");
    const was = before.find((o) => o.id === hours.id)?.views ?? 0;
    assert.ok(was >= 1);
    assert.equal(expired?.views, was, "تبقى إحصائياته، ولا يُعدّ بعد انتهائه");
    assert.equal(expired?.orders, 0);
    assert.ok(
      (own.find((o) => o.id === forever.id)?.views ?? 0) >
        (before.find((o) => o.id === forever.id)?.views ?? 0),
      "الدائم يُعدّ",
    );
  } finally {
    await pool.query("DELETE FROM jdatna.offers WHERE producer_id=$1", [
      family,
    ]);
    await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
      family,
    ]);
    await pool.query("DELETE FROM jdatna.users WHERE id=$1", [userId]);
    await pool.end();
  }
});
