import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import {
  adminSiteTexts,
  getSiteTemplate,
  getSiteTexts,
  setSiteTemplate,
  setSiteText,
} from "../src/server/settings";
import { siteTextDefaults } from "../src/lib/site-texts";

test(
  "isolated site template: admin-only, validated, audited and read back",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const pool = db();
    assert.ok(
      (await pool.query("SELECT current_database() AS n")).rows[0].n.startsWith(
        "jdatna_test_",
      ),
    );
    const admin = {
      id: randomUUID(),
      name: "مدير القالب",
      phone: "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"),
      role: "admin" as const,
    };
    const before = await getSiteTemplate();
    try {
      await pool.query(
        "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'admin',now())",
        [admin.id, admin.name, admin.phone],
      );
      await assert.rejects(
        setSiteTemplate(
          { ...admin, role: "customer" },
          { template: "classic" },
        ),
        { status: 403 },
      );
      await assert.rejects(setSiteTemplate(admin, { template: "modern" }));
      await setSiteTemplate(admin, { template: "classic" });
      assert.equal(await getSiteTemplate(), "classic");
      await setSiteTemplate(admin, { template: "najdi" });
      assert.equal(await getSiteTemplate(), "najdi");
      const audits = (
        await pool.query(
          "SELECT details->>'template' AS t FROM jdatna.admin_audit_logs WHERE actor_id=$1 AND action='site.template' ORDER BY created_at",
          [admin.id],
        )
      ).rows.map((r) => r.t);
      assert.deepEqual(audits, ["classic", "najdi"]);
      // النصوص: تعديل، حذف (فارغ)، واستعادة الأصل؛ للمدير فقط وبمفاتيح معروفة.
      await assert.rejects(
        setSiteText(
          { ...admin, role: "customer" },
          { key: "table.empty", value: "x" },
        ),
        { status: 403 },
      );
      await assert.rejects(
        setSiteText(admin, { key: "unknown.key", value: "x" }),
      );
      await setSiteText(admin, {
        key: "table.empty",
        value: "  الصحون جاية  ",
      });
      assert.equal((await getSiteTexts())["table.empty"], "الصحون جاية");
      await setSiteText(admin, { key: "footer.made", value: "" });
      assert.equal((await getSiteTexts())["footer.made"], "");
      const listed = await adminSiteTexts(admin);
      assert.equal(listed.find((t) => t.key === "footer.made")?.edited, true);
      assert.equal(
        listed.find((t) => t.key === "home.search")?.original,
        siteTextDefaults["home.search"],
      );
      for (const key of ["table.empty", "footer.made"])
        await setSiteText(admin, { key, value: null });
      assert.equal(
        (await getSiteTexts())["table.empty"],
        siteTextDefaults["table.empty"],
      );
    } finally {
      await pool.query(
        "UPDATE jdatna.site_settings SET value=$1,updated_by=NULL WHERE key='template'",
        [before],
      );
      await pool.query(
        "DELETE FROM jdatna.site_settings WHERE key IN ('text:table.empty','text:footer.made')",
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
