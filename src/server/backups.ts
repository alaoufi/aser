import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * الإدارة ← التقارير ← «النسخ الاحتياطية» (للمدير الكامل فقط).
 * النسخة ملف واحد مشفّر (AES-256) يكتبه الخادم يوميًا وقبل كل نشر، ويضم قاعدة البيانات
 * والوسائط والإعدادات. سجلّها في `backup_runs` يكتبه سكربت النسخ. التحميل يعمل فقط إن رُبط
 * مجلد النسخ بالتطبيق للقراءة (BACKUP_DIR)؛ والملف يبقى مشفّرًا ومفتاحه على الخادم وحده.
 */
const FILE = /^jdatna-\d{8}T\d{6}Z\.tar\.gpg$/;
const owner = (user: SessionUser) => {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
};
const dir = () => process.env.BACKUP_DIR?.trim() || "";

export type BackupRow = {
  file: string;
  createdAt: string;
  sizeBytes: number;
  databaseBytes: number;
  mediaBytes: number;
  sha256: string | null;
  /** الملف موجود الآن في مجلد النسخ المربوط بالتطبيق. */
  downloadable: boolean;
};

export async function backupReport(user: SessionUser) {
  owner(user);
  const rows = (
    await db().query(
      `SELECT file,created_at AS "createdAt",size_bytes::float8 AS "sizeBytes",database_bytes::float8 AS "databaseBytes",
         media_bytes::float8 AS "mediaBytes",sha256
       FROM jdatna.backup_runs ORDER BY created_at DESC LIMIT 60`,
    )
  ).rows as Omit<BackupRow, "downloadable">[];
  const root = dir();
  const backups: BackupRow[] = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      downloadable: root
        ? await stat(path.join(root, r.file)).then(
            (s) => s.isFile(),
            () => false,
          )
        : false,
    })),
  );
  return {
    backups,
    /** مجلد النسخ مربوط بالتطبيق فيمكن التحميل من هنا. */
    downloadEnabled: Boolean(root),
    latestAt: backups[0]?.createdAt ?? null,
  };
}

/** تحميل نسخة مشفّرة: اسم مطابق للنمط فقط، ومن مجلد النسخ فقط، ويُسجَّل في سجل الإدارة. */
export async function backupDownload(user: SessionUser, file: string) {
  owner(user);
  if (!FILE.test(file)) throw new HttpError(404, "النسخة غير موجودة");
  const root = dir();
  if (!root)
    throw new HttpError(409, "تحميل النسخ من الموقع غير مفعّل على الخادم");
  const full = path.join(root, file);
  const info = await stat(full).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "النسخة غير موجودة");
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES($1,$2,'backup.download',$3)",
    [randomUUID(), user.id, JSON.stringify({ file, size: info.size })],
  );
  return {
    size: info.size,
    stream: Readable.toWeb(createReadStream(full)) as ReadableStream,
  };
}
