import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  maedaPresets,
  usesHidden,
  visibleMaeda,
  type MaedaStyle,
} from "../src/lib/maeda";
import { siteTextDefaults, siteTextLabels } from "../src/lib/site-texts";
import type { SessionUser } from "../src/lib/types";

const brass: MaedaStyle = {
  shape: "oval",
  finish: "brass",
  color: "qahwa",
  edge: "gold",
  runner: true,
};

test("«صانع المائدة»: invalid or hidden choices fall back to the original Sadu table", () => {
  assert.deepEqual(visibleMaeda(brass, []), brass);
  assert.equal(visibleMaeda(brass, ["finish:brass"]), null);
  assert.equal(visibleMaeda(brass, ["runner"]), null);
  assert.deepEqual(visibleMaeda({ ...brass, runner: false }, ["runner"]), {
    ...brass,
    runner: false,
  });
  assert.equal(visibleMaeda({ ...brass, finish: "gold-leaf" }, []), null);
  assert.equal(visibleMaeda(null, []), null);
  assert.equal(visibleMaeda("sadu", []), null);
  assert.equal(usesHidden(brass, ["color:kohli"]), false);
});

test("«صانع المائدة»: every option, axis and preset has a «نصوص الموقع» key with a label", () => {
  const keys = [
    ...maedaPresets.map((p) => `maeda.preset.${p.id}`),
    ...["shape", "finish", "color", "edge", "runner"].map(
      (a) => `maeda.axis.${a}`,
    ),
    "maeda.shape.band",
    "maeda.shape.sufra",
    "maeda.finish.marble",
    "maeda.color.ramli",
    "maeda.edge.none",
    "maeda.runner.on",
    "maeda.runner.off",
    "maeda.title",
    "maeda.save",
    "maeda.saved",
    "maeda.adminTitle",
  ];
  for (const k of keys) {
    assert.ok(k in siteTextDefaults, k);
    assert.ok(k in siteTextLabels, k);
  }
  // الصيغة المحايدة (قرار المالك): لا «اختاري» ولا «احفظي» ولا «ركّبي».
  for (const [k, v] of Object.entries(siteTextDefaults))
    if (k.startsWith("maeda."))
      assert.doesNotMatch(v as string, /اختاري|احفظي|ركّبي|ركبي/, k);
});

test(
  "isolated «صانع المائدة»: the family saves its table, hidden options are refused, and the admin hides options",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const {
      familyMaeda,
      maedaAdmin,
      publicMaeda,
      setFamilyMaeda,
      setMaedaHidden,
    } = await import("../src/server/maeda");
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const mk = (role: SessionUser["role"]): SessionUser => ({
      id: randomUUID(),
      name: role,
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role,
    });
    const owner = mk("producer"),
      admin = mk("admin"),
      visitor = mk("customer");
    const familyId = randomUUID();
    const before = (
      await pool.query(
        "SELECT value FROM jdatna.site_settings WHERE key='maeda:hidden'",
      )
    ).rows[0]?.value as string | undefined;
    try {
      for (const u of [owner, admin, visitor])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,$4,now())",
          [u.id, u.name, u.phone, u.role],
        );
      const city = (await pool.query("SELECT id FROM jdatna.cities LIMIT 1"))
        .rows[0].id;
      await pool.query(
        "INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,city_id,phone,status) VALUES($1,$2,$3,'أسرة المائدة',$4,$5,'approved')",
        [familyId, owner.id, "maeda-" + familyId, city, owner.phone],
      );
      await setMaedaHidden(admin, { hidden: [] });
      // بلا اختيار: مائدة السدو الأصلية.
      assert.equal((await familyMaeda(owner)).style, null);
      assert.equal(await publicMaeda(familyId), null);
      // الأسرة تحفظ مائدتها، وتظهر للزوار.
      await setFamilyMaeda(owner, { style: brass });
      assert.deepEqual(await publicMaeda(familyId), brass);
      assert.equal((await familyMaeda(owner)).name, "أسرة المائدة");
      // قيمة خارج الخيارات تُرفض.
      await assert.rejects(
        setFamilyMaeda(owner, { style: { ...brass, finish: "gold" } }),
      );
      // الزائر والأسرة لا يديران الخيارات.
      await assert.rejects(setMaedaHidden(visitor, { hidden: [] }), {
        status: 403,
      });
      await assert.rejects(maedaAdmin(owner), { status: 403 });
      // الإدارة تخفي النحاس: عدد مستعمليه ظاهر لها، والصفحة العامة ترجع للسدو، وحفظه يُرفض.
      const a = await setMaedaHidden(admin, { hidden: ["finish:brass"] });
      assert.ok((a.used["finish:brass"] ?? 0) >= 1);
      assert.equal(await publicMaeda(familyId), null);
      assert.equal((await familyMaeda(owner)).style, null);
      await assert.rejects(setFamilyMaeda(owner, { style: brass }), {
        status: 400,
      });
      // إعادة إظهاره تعيد مائدة الأسرة كما حفظتها.
      await setMaedaHidden(admin, { hidden: [] });
      assert.deepEqual(await publicMaeda(familyId), brass);
      // الرجوع إلى السدو.
      await setFamilyMaeda(owner, { style: null });
      assert.equal(await publicMaeda(familyId), null);
      // مفتاح خيار غير صالح يُرفض.
      await assert.rejects(setMaedaHidden(admin, { hidden: ["x;drop"] }));
    } finally {
      if (before === undefined)
        await pool.query(
          "DELETE FROM jdatna.site_settings WHERE key='maeda:hidden'",
        );
      else
        await pool.query(
          "UPDATE jdatna.site_settings SET value=$1 WHERE key='maeda:hidden'",
          [before],
        );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query("DELETE FROM jdatna.producer_profiles WHERE id=$1", [
        familyId,
      ]);
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1)", [
        [owner.id, admin.id, visitor.id],
      ]);
    }
  },
);
