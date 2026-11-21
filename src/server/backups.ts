import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * الإدارة ← التقارير ← «النسخ الاحتياطية» (للمدير الكامل فقط).
 * الخادم يأخذ النسخ ويشفّرها (AES-256) ويرفعها إلى التخزين الخارجي (R2) إن هُيّئ، ويكتب سجلها
 * في `backup_runs`. «خذ نسخة الآن» يكتب طلبًا في `backup_requests` ينفّذه الخادم خلال دقيقة؛
 * التطبيق نفسه لا يملك صلاحية أخذ نسخة. التحميل من R2، أو من مجلد النسخ إن رُبط بالتطبيق.
 */
const FILE = /^jdatna-((media|codedb)-)?\d{8}T\d{6}Z\.tar\.gpg$/;
export const BACKUP_KINDS = ["full", "media", "codedb"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];
const owner = (user: SessionUser) => {
  if (user.role !== "admin") throw new HttpError(403, "لا تملك صلاحية الوصول");
};
const dir = () => process.env.BACKUP_DIR?.trim() || "";
const r2Ready = () =>
  Boolean(
    process.env.R2_ENDPOINT?.startsWith("https://") &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY,
  );
let r2Client: S3Client | undefined;
const r2 = () =>
  (r2Client ??= new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  }));

export type BackupRow = {
  file: string;
  /** daily: النسخة اليومية 05:00 بتوقيت الرياض (آخر 10). full: قبل النشر أو «خذ نسخة الآن». */
  kind: BackupKind | "daily";
  createdAt: string;
  sizeBytes: number;
  databaseBytes: number;
  mediaBytes: number;
  codeBytes: number;
  sha256: string | null;
  /** مرفوعة إلى التخزين الخارجي (R2). */
  remote: boolean;
  onServer: boolean;
  downloadable: boolean;
};
export type BackupRequest = {
  id: string;
  kind: BackupKind;
  status: "pending" | "running" | "done" | "failed";
  requestedAt: string;
  finishedAt: string | null;
  file: string | null;
  error: string | null;
};

async function localFile(file: string) {
  const root = dir();
  if (!root) return null;
  const full = path.join(
    root,
    file.includes("-media-") || file.includes("-codedb-") ? "manual" : "",
    file,
  );
  const info = await stat(full).catch(() => null);
  return info?.isFile() ? { full, size: info.size } : null;
}

export async function backupReport(user: SessionUser) {
  owner(user);
  const [runs, requests] = await Promise.all([
    db().query(
      `SELECT file,kind,created_at AS "createdAt",size_bytes::float8 AS "sizeBytes",database_bytes::float8 AS "databaseBytes",
         media_bytes::float8 AS "mediaBytes",code_bytes::float8 AS "codeBytes",sha256,remote,on_server AS "onServer"
       FROM jdatna.backup_runs ORDER BY created_at DESC LIMIT 60`,
    ),
    db().query(
      `SELECT id,kind,status,requested_at AS "requestedAt",finished_at AS "finishedAt",file,error
       FROM jdatna.backup_requests ORDER BY requested_at DESC LIMIT 5`,
    ),
  ]);
  const remoteReady = r2Ready();
  const backups: BackupRow[] = await Promise.all(
    (runs.rows as Omit<BackupRow, "downloadable">[]).map(async (r) => ({
      ...r,
      downloadable:
        (remoteReady && r.remote) || Boolean(await localFile(r.file)),
    })),
  );
  return {
    backups,
    requests: requests.rows as BackupRequest[],
    /** التخزين الخارجي (R2) مهيأ في التطبيق للتحميل منه. */
    remoteReady,
    downloadEnabled: remoteReady || Boolean(dir()),
    latestAt: backups[0]?.createdAt ?? null,
  };
}

/** «خذ نسخة الآن»: طلب واحد قائم في الوقت نفسه، ينفّذه الخادم ويظهر في السجل. */
export async function requestBackup(user: SessionUser, input: unknown) {
  owner(user);
  const { kind } = z
    .object({ kind: z.enum(BACKUP_KINDS) })
    .strict()
    .parse(input);
  const id = randomUUID();
  const inserted = await db().query(
    `INSERT INTO jdatna.backup_requests(id,kind,requested_by) VALUES($1,$2,$3)
     ON CONFLICT DO NOTHING RETURNING id`,
    [id, kind, user.id],
  );
  if (!inserted.rowCount)
    throw new HttpError(409, "هناك نسخة قيد التنفيذ الآن. انتظر انتهاءها");
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES($1,$2,'backup.request',$3)",
    [randomUUID(), user.id, JSON.stringify({ kind })],
  );
  return backupReport(user);
}

/** تحميل نسخة مشفّرة: اسم مطابق للنمط ومسجّل فقط، من R2 أو من مجلد النسخ، ويُسجَّل في سجل الإدارة. */
export async function backupDownload(user: SessionUser, file: string) {
  owner(user);
  if (!FILE.test(file)) throw new HttpError(404, "النسخة غير موجودة");
  const row = (
    await db().query("SELECT remote FROM jdatna.backup_runs WHERE file=$1", [
      file,
    ])
  ).rows[0] as { remote: boolean } | undefined;
  if (!row) throw new HttpError(404, "النسخة غير موجودة");
  const local = await localFile(file);
  if (!local && !(r2Ready() && row.remote)) {
    if (!dir() && !r2Ready())
      throw new HttpError(409, "تحميل النسخ من الموقع غير مفعّل على الخادم");
    throw new HttpError(404, "النسخة غير موجودة");
  }
  let size: number, stream: ReadableStream;
  if (local) {
    size = local.size;
    stream = Readable.toWeb(createReadStream(local.full)) as ReadableStream;
  } else {
    const object = await r2()
      .send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: file }))
      .catch(() => null);
    if (!object?.Body) throw new HttpError(404, "النسخة غير موجودة في التخزين");
    size = Number(object.ContentLength ?? 0);
    stream = object.Body.transformToWebStream();
  }
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES($1,$2,'backup.download',$3)",
    [
      randomUUID(),
      user.id,
      JSON.stringify({ file, size, from: local ? "server" : "r2" }),
    ],
  );
  return { size, stream };
}
