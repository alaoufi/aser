import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db } from "./db";
import { HttpError } from "./security";

/**
 * «دليلي» (قرار المالك 2026-11-22): دفتر جهات خاص بصاحبه وحده، لا يراه غيره.
 *   - العميل يحفظ الأسر والمندوبين.
 *   - الأسرة تحفظ عملاءها (من طلب منها أو راسلها فقط) ومندوبيها.
 *   - لكلٍّ إضافة جهة يدويًا (اسم وجوال وواتساب)، أو من جهات جواله حيث يدعمها المتصفح.
 * بيانات تواصل الأسرة أو المندوب تُقرأ من ملفه وقت العرض بحسب ما يسمح بإظهاره، فإن أخفاها لم تظهر.
 * وجوال العميل يظهر لأسرة طلب منها (أعطاها رقمه في طلبه). وما يضيفه صاحب الدليل بنفسه يظهر له دائمًا.
 */
export type DirectoryKind = "family" | "courier" | "customer" | "contact";
export type DirectoryEntry = {
  id: string;
  kind: DirectoryKind;
  name: string;
  /** رقم العضو للجهة المسجلة في الموقع (لا للجهات اليدوية). */
  memberNo: number | null;
  /** أسماء وروابط من ملف الجهة (الأسرة أو المندوب). */
  slug: string | null;
  city: string | null;
  /** الجوال وواتساب المسموح بهما من ملف الجهة. */
  phone: string | null;
  whatsapp: string | null;
  /** ما أضافه صاحب الدليل بنفسه. */
  ownPhone: string | null;
  ownWhatsapp: string | null;
  note: string;
  customerId: string | null;
  createdAt: string;
};

const MAX_ENTRIES = 500;

/** رقم الجوال بصيغة واحدة: 05… يصير +9665…، و00 يصير +، وما سوى ذلك أرقام فقط. */
export function cleanPhone(value: string | null | undefined): string | null {
  const raw = (value ?? "")
    .replace(/[\s\-().]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (!raw) return null;
  let p = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  if (/^05\d{8}$/.test(p)) p = `+966${p.slice(1)}`;
  else if (/^5\d{8}$/.test(p)) p = `+966${p}`;
  else if (/^9665\d{8}$/.test(p)) p = `+${p}`;
  if (!/^\+?[0-9]{6,15}$/.test(p))
    throw new HttpError(400, "رقم الجوال غير صحيح");
  return p;
}

const phoneField = z
  .string()
  .trim()
  .max(30)
  .optional()
  .nullable()
  .transform((v) => (v ? cleanPhone(v) : null));
const contactSchema = z.object({
  name: z.string().trim().min(1, "اكتب الاسم").max(120),
  phone: phoneField,
  whatsapp: phoneField,
  note: z.string().trim().max(300).optional().default(""),
});
const addSchema = z.union([
  z.object({ producer: z.string().trim().min(1).max(200) }).strict(),
  z.object({ courier: z.uuid() }).strict(),
  z.object({ customer: z.uuid() }).strict(),
  z.object({ contact: contactSchema }).strict(),
]);

async function familyOf(user: SessionUser) {
  return (
    await db().query<{ id: string }>(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0]?.id;
}

async function count(user: SessionUser) {
  return (
    await db().query<{ n: number }>(
      "SELECT count(*)::int AS n FROM jdatna.directory_entries WHERE owner_id=$1",
      [user.id],
    )
  ).rows[0].n;
}

export async function listDirectory(
  user: SessionUser,
): Promise<DirectoryEntry[]> {
  const family = await familyOf(user);
  return (
    await db().query<DirectoryEntry>(
      `SELECT d.id,d.kind,
         COALESCE(p.trade_name,p.name,k.name,
           -- عميل راسلته الأسرة من طلب لم يوافق فيه على إظهار اسمه، ولم يطلب منها: «عميل».
           CASE WHEN d.kind='customer' AND EXISTS(SELECT 1 FROM jdatna.conversations ac
               WHERE ac.customer_id=d.customer_id AND ac.producer_id=$2 AND ac.anonymous_customer)
             AND NOT EXISTS(SELECT 1 FROM jdatna.order_requests ao
               WHERE ao.user_id=d.customer_id AND ao.producer_id=$2) THEN 'عميل' ELSE cu.name END,
           d.name) AS name,
         COALESCE((SELECT pu.member_no FROM jdatna.users pu WHERE pu.id=p.user_id),ku.member_no,cu.member_no) AS "memberNo",
         p.slug,
         COALESCE(pc.name,kc.name) AS city,
         CASE
           WHEN d.kind='family' AND p.status='approved' AND p.show_phone THEN p.phone
           WHEN d.kind='courier' AND k.status='approved' AND k.show_phone THEN ku.phone
           WHEN d.kind='customer' THEN (SELECT o.phone FROM jdatna.order_requests o
             WHERE o.user_id=d.customer_id AND o.producer_id=$2 ORDER BY o.created_at DESC LIMIT 1)
         END AS phone,
         CASE
           WHEN d.kind='family' AND p.status='approved' AND p.show_whatsapp THEN NULLIF(p.whatsapp,'')
           WHEN d.kind='courier' AND k.status='approved' AND k.show_whatsapp THEN ku.phone
         END AS whatsapp,
         d.phone AS "ownPhone",d.whatsapp AS "ownWhatsapp",d.note,
         d.customer_id AS "customerId",d.created_at AS "createdAt"
       FROM jdatna.directory_entries d
       LEFT JOIN jdatna.producer_profiles p ON p.id=d.producer_id
       LEFT JOIN jdatna.cities pc ON pc.id=p.city_id
       LEFT JOIN jdatna.courier_profiles k ON k.id=d.courier_id
       LEFT JOIN jdatna.users ku ON ku.id=k.user_id
       LEFT JOIN jdatna.cities kc ON kc.id=k.city_id
       LEFT JOIN jdatna.users cu ON cu.id=d.customer_id
       WHERE d.owner_id=$1
       ORDER BY d.kind,lower(COALESCE(p.trade_name,p.name,k.name,cu.name,d.name))`,
      [user.id, family ?? null],
    )
  ).rows;
}

/** ما حُفظ في الدليل (للزر «في دليلي» في صفحة الأسرة وغيرها). */
export async function inDirectory(
  user: SessionUser,
  target: { producer?: string; courier?: string; customer?: string },
) {
  const row = (
    await db().query<{ id: string }>(
      `SELECT d.id FROM jdatna.directory_entries d
       LEFT JOIN jdatna.producer_profiles p ON p.id=d.producer_id
       WHERE d.owner_id=$1 AND (p.slug=$2 OR d.courier_id=$3::uuid OR d.customer_id=$4::uuid)`,
      [
        user.id,
        target.producer ?? null,
        target.courier ?? null,
        target.customer ?? null,
      ],
    )
  ).rows[0];
  return row?.id ?? null;
}

export async function addToDirectory(user: SessionUser, input: unknown) {
  const parsed = addSchema.parse(input);
  if ((await count(user)) >= MAX_ENTRIES)
    throw new HttpError(400, `الدليل يتسع لـ ${MAX_ENTRIES} جهة`);
  const id = randomUUID();
  if ("producer" in parsed) {
    const p = (
      await db().query<{ id: string; name: string; user_id: string }>(
        "SELECT id,COALESCE(trade_name,name) AS name,user_id FROM jdatna.producer_profiles WHERE slug=$1 AND status='approved' AND NOT review_only",
        [parsed.producer],
      )
    ).rows[0];
    if (!p) throw new HttpError(404, "الأسرة غير موجودة");
    if (p.user_id === user.id)
      throw new HttpError(400, "هذه أسرتك، لا تحتاج حفظها");
    await db().query(
      `INSERT INTO jdatna.directory_entries(id,owner_id,kind,producer_id,name)
       VALUES($1,$2,'family',$3,$4) ON CONFLICT DO NOTHING`,
      [id, user.id, p.id, p.name],
    );
  } else if ("courier" in parsed) {
    const k = (
      await db().query<{ id: string; name: string; user_id: string }>(
        "SELECT id,name,user_id FROM jdatna.courier_profiles WHERE (id=$1 OR user_id=$1) AND status='approved'",
        [parsed.courier],
      )
    ).rows[0];
    if (!k) throw new HttpError(404, "المندوب غير موجود");
    if (k.user_id === user.id) throw new HttpError(400, "لا تحتاج حفظ نفسك");
    await db().query(
      `INSERT INTO jdatna.directory_entries(id,owner_id,kind,courier_id,name)
       VALUES($1,$2,'courier',$3,$4) ON CONFLICT DO NOTHING`,
      [id, user.id, k.id, k.name],
    );
  } else if ("customer" in parsed) {
    // الأسرة وحدها، ولعميل طلب منها أو راسلها فقط.
    const family = await familyOf(user);
    if (!family) throw new HttpError(403, "حفظ العملاء للأسر المنتجة فقط");
    const c = (
      await db().query<{ name: string }>(
        `SELECT u.name FROM jdatna.users u WHERE u.id=$1 AND (
           EXISTS(SELECT 1 FROM jdatna.order_requests o WHERE o.user_id=u.id AND o.producer_id=$2)
           OR EXISTS(SELECT 1 FROM jdatna.conversations c WHERE c.customer_id=u.id AND c.producer_id=$2))`,
        [parsed.customer, family],
      )
    ).rows[0];
    if (!c) throw new HttpError(404, "تحفظ الأسرة من طلب منها أو راسلها فقط");
    await db().query(
      `INSERT INTO jdatna.directory_entries(id,owner_id,kind,customer_id,name)
       VALUES($1,$2,'customer',$3,$4) ON CONFLICT DO NOTHING`,
      [id, user.id, parsed.customer, c.name],
    );
  } else {
    const { name, phone, whatsapp, note } = parsed.contact;
    if (!phone && !whatsapp) throw new HttpError(400, "اكتب الجوال أو واتساب");
    await db().query(
      `INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,phone,whatsapp,note)
       VALUES($1,$2,'contact',$3,$4,$5,$6)`,
      [id, user.id, name, phone, whatsapp, note],
    );
  }
  return { ok: true };
}

/** جهات من الجوال (Contact Picker): الاسم والرقم الأول، وما سبق حفظه بالرقم نفسه يُترك. */
export async function importContacts(user: SessionUser, input: unknown) {
  const { contacts } = z
    .object({
      contacts: z
        .array(
          z.object({
            name: z.string().trim().max(120).default(""),
            phone: z.string().trim().max(30),
          }),
        )
        .min(1)
        .max(50),
    })
    .parse(input);
  const room = MAX_ENTRIES - (await count(user));
  let added = 0;
  let skipped = 0;
  for (const c of contacts.slice(0, Math.max(0, room))) {
    let phone: string | null;
    try {
      phone = cleanPhone(c.phone);
    } catch {
      skipped++;
      continue;
    }
    if (!phone) {
      skipped++;
      continue;
    }
    const r = await db().query(
      `INSERT INTO jdatna.directory_entries(id,owner_id,kind,name,phone)
       SELECT $1,$2,'contact',$3,$4
       WHERE NOT EXISTS(SELECT 1 FROM jdatna.directory_entries WHERE owner_id=$2 AND phone=$4)`,
      [randomUUID(), user.id, c.name || phone, phone],
    );
    if (r.rowCount) added++;
    else skipped++;
  }
  return { added, skipped };
}

export async function updateDirectoryEntry(
  user: SessionUser,
  id: string,
  input: unknown,
) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "غير موجود");
  const v = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      phone: phoneField,
      whatsapp: phoneField,
      note: z.string().trim().max(300).optional(),
    })
    .parse(input);
  const r = await db().query(
    `UPDATE jdatna.directory_entries SET
       name=CASE WHEN kind='contact' THEN COALESCE($3,name) ELSE name END,
       phone=$4,whatsapp=$5,note=COALESCE($6,note)
     WHERE id=$1 AND owner_id=$2`,
    [id, user.id, v.name ?? null, v.phone, v.whatsapp, v.note ?? null],
  );
  if (!r.rowCount) throw new HttpError(404, "غير موجود");
  return { ok: true };
}

export async function removeDirectoryEntry(user: SessionUser, id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "غير موجود");
  const r = await db().query(
    "DELETE FROM jdatna.directory_entries WHERE id=$1 AND owner_id=$2",
    [id, user.id],
  );
  if (!r.rowCount) throw new HttpError(404, "غير موجود");
  return { ok: true };
}
