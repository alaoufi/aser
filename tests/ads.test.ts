import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { SessionUser } from "../src/lib/types";
import {
  deliver,
  fitsFrame,
  inSchedule,
  matchesContext,
  orderAds,
  type DeliverableAd,
} from "../src/lib/ads";

/** الإعلانات الترويجية (من «أي خدمة»): قواعد العرض، والحفظ والعرض والعدّ على قاعدة معزولة. */
const base: DeliverableAd = {
  priority: 2,
  weight: 1,
  schedule: null,
  target_devices: [],
  target_audience: [],
  target_regions: [],
  exclusive: false,
};
const guest = {
  device: "mobile" as const,
  audience: "guest" as const,
  region: null,
};

test("weekly schedule in Saudi time, including a window past midnight", () => {
  // الخميس 2026-11-19 الساعة 21:00 بتوقيت السعودية = 18:00 UTC.
  const thu9pm = new Date("2026-11-19T18:00:00Z");
  assert.equal(inSchedule(null, thu9pm), true);
  assert.equal(inSchedule({ days: [4] }, thu9pm), true);
  assert.equal(inSchedule({ days: [5] }, thu9pm), false);
  assert.equal(inSchedule({ from: "20:00", to: "02:00" }, thu9pm), true);
  assert.equal(inSchedule({ from: "08:00", to: "12:00" }, thu9pm), false);
});

test("targeting by device, audience and region; a region-targeted ad needs a known region", () => {
  assert.equal(
    matchesContext({ ...base, target_devices: ["desktop"] }, guest),
    false,
  );
  assert.equal(
    matchesContext({ ...base, target_audience: ["producer"] }, guest),
    false,
  );
  assert.equal(
    matchesContext({ ...base, target_regions: ["riyadh"] }, guest),
    false,
  );
  assert.equal(
    matchesContext(
      { ...base, target_regions: ["riyadh"] },
      { ...guest, region: "riyadh" },
    ),
    true,
  );
  assert.equal(matchesContext(base, guest), true);
});

test("priority first, then weighted rotation; an exclusive ad takes the place", () => {
  const high = { ...base, id: "h", priority: 1 };
  const normal = { ...base, id: "n" };
  assert.equal(orderAds([normal, high])[0].id, "h");
  // وزن 3 مقابل 1: يأتي أولًا نحو 75%.
  let first = 0;
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 4000; i++)
    if (
      orderAds(
        [
          { ...base, id: "a", weight: 3 },
          { ...base, id: "b" },
        ],
        random,
      )[0].id === "a"
    )
      first++;
  assert.ok(first > 2800 && first < 3200, String(first));
  const out = deliver([normal, { ...base, id: "x", exclusive: true }], guest);
  assert.deepEqual(
    out.map((a) => a.id),
    ["x"],
  );
});

test("a picture fits the frame only in its shape and large enough", () => {
  assert.equal(fitsFrame({ width: 1200, height: 400 }), true);
  assert.equal(fitsFrame({ width: 900, height: 300 }), true);
  assert.equal(fitsFrame({ width: 600, height: 200 }), false, "too small");
  assert.equal(fitsFrame({ width: 800, height: 1200 }), false, "wrong shape");
});

test(
  "admin ads: saved by the ads permission, shown only while live and targeted, counted, explained and reported",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const ads = await import("../src/server/ads");
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: SessionUser["role"], permissions: string[] = []) =>
      ({
        id: randomUUID(),
        name: "إعلانات",
        phone:
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
        role,
        permissions,
      }) as SessionUser;
    const staff = mk("customer", ["ads"]);
    const other = mk("customer", ["content"]);
    await pool.query(
      "INSERT INTO jdatna.users(id,name,phone,role,permissions,phone_verified_at) VALUES($1,$2,$3,$4,$5,now())",
      [staff.id, staff.name, staff.phone, staff.role, staff.permissions],
    );
    const ids: string[] = [];
    try {
      await pool.query(
        "DELETE FROM jdatna.ads WHERE title LIKE 'اختبار-إعلان%'",
      );
      const save = async (input: Record<string, unknown>) => {
        const d = await ads.saveAd(staff, {
          placements: ["home_top"],
          ...input,
        });
        const ad = d.ads.find((a) => a.title === input.title)!;
        ids.push(ad.id);
        return ad;
      };
      await assert.rejects(ads.adminAds(other), { status: 403 });
      await assert.rejects(ads.saveAd(staff, { title: "x", placements: [] }));
      await assert.rejects(
        ads.saveAd(staff, {
          title: "x",
          placements: ["home_top"],
          link: "javascript:alert(1)",
        }),
      );
      await assert.rejects(
        ads.saveAd(staff, {
          title: "x",
          placements: ["home_top"],
          pacing: "even",
        }),
        /التوزيع المتساوي/,
      );
      // صورة 800×1200 تُعاد للإطار 1200×400.
      const tall = await sharp({
        create: { width: 800, height: 1200, channels: 3, background: "#c84" },
      })
        .jpeg()
        .toBuffer();
      const media = await ads.uploadAdMedia(
        staff,
        new File([tall], "tall.jpg", { type: "image/jpeg" }),
      );
      const stored = await ads.adMedia(media.id);
      const meta = await sharp(stored.data).metadata();
      assert.deepEqual(
        [meta.width, meta.height, meta.format],
        [1200, 400, "webp"],
      );
      await assert.rejects(
        ads.uploadAdMedia(
          staff,
          new File([Buffer.from("x")], "a.txt", { type: "text/plain" }),
        ),
        { status: 400 },
      );

      const live = await save({
        title: "اختبار-إعلان-عامل",
        mediaId: media.id,
        link: "/offers",
      });
      await save({ title: "اختبار-إعلان-موقوف", status: "paused" });
      await save({
        title: "اختبار-إعلان-قادم",
        startsAt: new Date(Date.now() + 864e5).toISOString(),
      });
      await save({ title: "اختبار-إعلان-الرياض", targetRegions: ["riyadh"] });
      const capped = await save({
        title: "اختبار-إعلان-يومي",
        dailyMaxViews: 1,
      });
      const shown = async (region: string | null = null) =>
        (await ads.liveAds("home_top", { ...guest, region }, 20))
          .map((a) => a.title)
          .filter((t) => t.startsWith("اختبار-إعلان"))
          .sort();
      assert.deepEqual(await shown(), [
        "اختبار-إعلان-عامل",
        "اختبار-إعلان-يومي",
      ]);
      assert.ok((await shown("riyadh")).includes("اختبار-إعلان-الرياض"));
      // إعلان الإدارة ترويجي (بلا كلمة «إعلان»)، وصورته برابط عام.
      const pub = (await ads.liveAds("home_top", guest, 20)).find(
        (a) => a.id === live.id,
      )!;
      assert.equal(pub.promo, true);
      assert.equal(pub.media, `/api/ads/media/${media.id}`);
      // الحد اليومي: بعد مشاهدة واحدة يتوقف اليوم.
      await ads.trackAd(capped.id, "view");
      assert.ok(!(await shown()).includes("اختبار-إعلان-يومي"));
      await ads.trackAd(live.id, "view");
      await ads.trackAd(live.id, "click");
      // الحملة الموقوفة توقف إعلاناتها.
      const withCampaign = await ads.saveCampaign(staff, {
        name: "اختبار-حملة",
        status: "paused",
      });
      const campaign = withCampaign.campaigns.find(
        (c) => c.name === "اختبار-حملة",
      ) as { id: string };
      await ads.saveAd(staff, {
        id: live.id,
        title: "اختبار-إعلان-عامل",
        placements: ["home_top"],
        mediaId: media.id,
        campaignId: campaign.id,
      });
      assert.ok(!(await shown()).includes("اختبار-إعلان-عامل"));
      const why = await ads.whyAd(staff, live.id);
      assert.equal(why.live, false);
      assert.ok(why.checks.some((c) => !c.ok && c.fix === "campaignId"));
      await ads.deleteCampaign(staff, campaign.id);
      assert.ok(
        (await shown()).includes("اختبار-إعلان-عامل"),
        "deleting a campaign keeps its ads",
      );
      // التقرير وملف CSV لا يبدأ بصيغة تُنفَّذ في Excel.
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
      }).format(new Date());
      const report = await ads.adsReport(staff, { from: day, to: day });
      const row = report.rows.find((r) => r.id === live.id)!;
      assert.deepEqual([row.views, row.clicks, row.ctr], [1, 1, 100]);
      const csv = ads.reportCsv([{ ...row, title: "=HYPERLINK(1)" }]);
      assert.ok(csv.startsWith("﻿"));
      assert.ok(csv.includes(`"'=HYPERLINK(1)"`));
      // الإيقاف والحذف، وسجل النشاطات.
      await ads.changeAd(staff, { id: live.id, action: "pause" });
      assert.ok(!(await shown()).includes("اختبار-إعلان-عامل"));
      await ads.changeAd(staff, { id: live.id, action: "delete" });
      await assert.rejects(ads.adMedia(media.id), { status: 404 });
      const logged = (
        await pool.query(
          "SELECT count(*)::int AS n FROM jdatna.admin_audit_logs WHERE actor_id=$1 AND action LIKE 'ad%'",
          [staff.id],
        )
      ).rows[0].n;
      assert.ok(logged >= 8, String(logged));
    } finally {
      await pool.query("DELETE FROM jdatna.ads WHERE id = ANY($1::uuid[])", [
        ids,
      ]);
      await pool.query("DELETE FROM jdatna.ad_campaigns WHERE created_by=$1", [
        staff.id,
      ]);
      await pool.query("DELETE FROM jdatna.ad_media WHERE created_by=$1", [
        staff.id,
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [staff.id],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [staff.id]);
      await pool.end();
    }
  },
);
