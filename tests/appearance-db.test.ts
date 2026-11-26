import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setSiteTemplate } from "../src/server/settings";

/** «المظهر» (2026-11-26) على قاعدة اختبار معزولة: إعداد الإدارة ومظهر العضو. */
test(
  "isolated appearance settings: enabled templates and palettes, default always enabled, visitor choice saved per member",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db: open } = await import("../src/server/db");
    const { getAppearanceSettings } = await import("../src/server/settings");
    const { getMemberAppearance, saveMemberAppearance } =
      await import("../src/server/member-appearance");
    const pool = open();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const admin = {
      id: randomUUID(),
      name: "مدير المظهر",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "admin" as const,
    };
    const keys = ["template", "templates", "palette", "palettes"];
    const before = (
      await pool.query(
        "SELECT key,value FROM jdatna.site_settings WHERE key=ANY($1::text[])",
        [keys],
      )
    ).rows as { key: string; value: string }[];
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'admin',now())",
        [admin.id, admin.name, admin.phone],
      );
      await setSiteTemplate(admin, {
        template: "simple",
        templates: ["classic"],
        palette: "lail",
        palettes: ["sadu", "contrast"],
      });
      const s = await getAppearanceSettings();
      assert.equal(s.template, "simple");
      assert.deepEqual(s.templates, ["classic", "simple"]);
      assert.equal(s.palette, "lail");
      assert.deepEqual(s.palettes, ["sadu", "lail", "contrast"]);
      await assert.rejects(
        setSiteTemplate(admin, { template: "classic", palettes: ["pink"] }),
      );
      // مظهر العضو: يُحفظ ويُدمج (القالب ثم اللون)، ويرفض المجهول.
      assert.equal(await getMemberAppearance(admin.id), null);
      await saveMemberAppearance(admin, { template: "simple" });
      await saveMemberAppearance(admin, { palette: "contrast" });
      assert.deepEqual(await getMemberAppearance(admin.id), {
        template: "simple",
        palette: "contrast",
      });
      await assert.rejects(saveMemberAppearance(admin, { palette: "pink" }));
      await assert.rejects(saveMemberAppearance(admin, {}));
    } finally {
      await pool.query(
        "DELETE FROM jdatna.site_settings WHERE key=ANY($1::text[])",
        [keys],
      );
      for (const r of before)
        await pool.query(
          "INSERT INTO jdatna.site_settings(key,value) VALUES($1,$2)",
          [r.key, r.value],
        );
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=$1", [admin.id]);
      await pool.end();
    }
  },
);
