import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "../src/server/db";
import { backupDownload, backupReport } from "../src/server/backups";
import type { SessionUser } from "../src/lib/types";

test(
  "backups report lists recorded backups for the full admin only, and downloads only real backup files from the mounted folder",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
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
    const admin = mk("admin"),
      supervisor = { ...mk("customer"), permissions: ["content", "reports"] },
      customer = mk("customer");
    const file = "jdatna-20990101T000000Z.tar.gpg",
      gone = "jdatna-20990102T000000Z.tar.gpg";
    const dir = mkdtempSync(path.join(tmpdir(), "jdatna-backups-"));
    const before = process.env.BACKUP_DIR;
    try {
      for (const u of [admin, supervisor, customer])
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at,permissions) VALUES($1,$2,$3,$4,now(),$5)",
          [
            u.id,
            u.name,
            u.phone,
            u.role,
            (u as { permissions?: string[] }).permissions ?? [],
          ],
        );
      await pool.query(
        `INSERT INTO jdatna.backup_runs(file,size_bytes,database_bytes,media_bytes,sha256,created_at)
         VALUES($1,7,1000,5000,$3,now()),($2,9,10,20,NULL,now()-interval '1 day')`,
        [file, gone, "a".repeat(64)],
      );
      writeFileSync(path.join(dir, file), "ENCRYPT");
      writeFileSync(path.join(dir, "secret.txt"), "no");
      // للمدير الكامل فقط؛ المشرف والعميل ممنوعان.
      await assert.rejects(backupReport(supervisor as SessionUser), {
        status: 403,
      });
      await assert.rejects(backupReport(customer), { status: 403 });
      await assert.rejects(backupDownload(customer, file), { status: 403 });
      // بلا ربط مجلد النسخ: القائمة تظهر والتحميل معطّل.
      delete process.env.BACKUP_DIR;
      const off = await backupReport(admin);
      assert.equal(off.downloadEnabled, false);
      assert.ok(off.backups.every((b) => !b.downloadable));
      await assert.rejects(backupDownload(admin, file), { status: 409 });
      // مع الربط: الموجود يُحمَّل، والمحذوف من الخادم لا.
      process.env.BACKUP_DIR = dir;
      const on = await backupReport(admin);
      const mine = on.backups.filter((b) => [file, gone].includes(b.file));
      assert.deepEqual(
        mine.map((b) => [
          b.file,
          b.downloadable,
          b.databaseBytes,
          b.mediaBytes,
        ]),
        [
          [file, true, 1000, 5000],
          [gone, false, 10, 20],
        ],
      );
      const got = await backupDownload(admin, file);
      assert.equal(got.size, 7);
      assert.equal(await new Response(got.stream).text(), "ENCRYPT");
      await assert.rejects(backupDownload(admin, gone), { status: 404 });
      // أسماء خارج النمط (ملف آخر، أو خروج من المجلد) مرفوضة.
      for (const bad of [
        "secret.txt",
        "../secret.txt",
        "jdatna-x.tar.gpg",
        "..%2Fsecret.txt",
      ])
        await assert.rejects(backupDownload(admin, bad), { status: 404 });
      // كل تحميل يُسجَّل.
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM jdatna.admin_audit_logs WHERE actor_id=$1 AND action='backup.download'",
            [admin.id],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      if (before === undefined) delete process.env.BACKUP_DIR;
      else process.env.BACKUP_DIR = before;
      rmSync(dir, { recursive: true, force: true });
      await pool.query("DELETE FROM jdatna.backup_runs WHERE file=ANY($1)", [
        [file, gone],
      ]);
      await pool.query(
        "DELETE FROM jdatna.admin_audit_logs WHERE actor_id=$1",
        [admin.id],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        [admin.id, supervisor.id, customer.id],
      ]);
    }
  },
);
