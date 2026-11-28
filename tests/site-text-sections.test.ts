import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  siteTextDefaults,
  siteTextLabels,
  siteTextSection,
  siteTextSections,
} from "../src/lib/site-texts";

/**
 * طلب المالك 2026-11-28: كل نص أو رسالة أو تنبيه في «نصوص الموقع»، مفهرسة بقائمة منسدلة
 * (الواجهة، واجهة العميل، واجهة الأسرة، الرسائل، التنبيهات…).
 */
test("every site text group belongs to a section in the dropdown", () => {
  const missing = new Set<string>();
  for (const [group] of Object.values(siteTextLabels))
    if (siteTextSection(group) === "أخرى") missing.add(group);
  assert.deepEqual([...missing], [], "أضف المجموعة إلى siteTextSections");
  const names = siteTextSections.map(([name]) => name);
  for (const name of [
    "الواجهة العامة",
    "واجهة العميل",
    "واجهة الأسرة",
    "الرسائل",
    "التنبيهات",
  ])
    assert.ok(names.includes(name), name);
});

test("server notifications take their wording from the site texts, not hard-coded strings", () => {
  const dir = "src/server";
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(`${dir}/${file}`, "utf8");
    // عنوان أو نص إشعار مكتوب حرفيًا بالعربية داخل notifyUser/notifyApprovers.
    for (const m of src.matchAll(
      /notify(?:User|Approvers)\([\s\S]{0,400}?\n\s*\}\)/g,
    ))
      if (/(title|body):\s*[`"][^`"]*[؀-ۿ]/.test(m[0]))
        offenders.push(`${file}: ${m[0].slice(0, 80)}`);
  }
  assert.deepEqual(offenders, []);
  for (const key of [
    "msg.order.new.title",
    "msg.chat.title",
    "chatOrder.msg.complete",
    "alert.family.pending.title",
    "docsWeekly.family.grace",
  ])
    assert.ok(key in siteTextDefaults, key);
});

test(
  "an edited message wording is what members receive",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const { db } = await import("../src/server/db");
    const { msg, resetMessageTexts } = await import("../src/server/messages");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    try {
      resetMessageTexts();
      assert.equal(
        await msg("msg.chat.title", { name: "أم محمد" }),
        "رسالة جديدة من أم محمد",
      );
      await pool.query(
        "INSERT INTO jdatna.site_settings(key,value) VALUES('text:msg.chat.title','وصلتك رسالة من {name}') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      );
      resetMessageTexts();
      assert.equal(
        await msg("msg.chat.title", { name: "أم محمد" }),
        "وصلتك رسالة من أم محمد",
      );
      // المحذوف يعود لأصله: لا رسالة فارغة.
      await pool.query(
        "UPDATE jdatna.site_settings SET value='' WHERE key='text:msg.chat.title'",
      );
      resetMessageTexts();
      assert.equal(
        await msg("msg.chat.title", { name: "أم محمد" }),
        "رسالة جديدة من أم محمد",
      );
    } finally {
      await pool.query(
        "DELETE FROM jdatna.site_settings WHERE key='text:msg.chat.title'",
      );
      resetMessageTexts();
    }
  },
);
