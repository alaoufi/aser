import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { can, isManager } from "../lib/permissions";
import { db, databaseConfigured } from "./db";
import { HttpError } from "./security";
import { clientIp, mask } from "./security-events";

/**
 * المشاهدات: تُحسب دائمًا لصفحة المنتج وصفحة الأسرة (الموقع والتطبيقان يعرضان الصفحات نفسها).
 * مشاهدة واحدة لكل زائر لكل صفحة في اليوم؛ لا تُحسب زيارة صاحب الأسرة لصفحاته ولا محركات البحث.
 * ظهور العدد: للجميع إن فعّلته الإدارة، وإلا لمن له صلاحية في الإدارة فقط.
 */
const viewSchema = z
  .object({ kind: z.enum(["product", "producer"]), id: z.uuid() })
  .strict();
const BOT =
  /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegrambot|preview|lighthouse|headless/i;

export async function viewsPublic() {
  if (!databaseConfigured()) return false;
  const row = (
    await db().query(
      "SELECT value FROM jdatna.site_settings WHERE key='views.public'",
    )
  ).rows[0];
  return row?.value === "on";
}

export async function recordView(
  request: Request,
  user: SessionUser | null,
  input: unknown,
) {
  const { kind, id } = viewSchema.parse(input);
  if (!databaseConfigured()) return { visible: false as const };
  // الصفحة يجب أن تكون عامة: منتج ظاهر لأسرة معتمدة، أو أسرة معتمدة.
  const target = (
    await db().query(
      kind === "product"
        ? `SELECT p.user_id AS owner FROM jdatna.products x JOIN jdatna.producer_profiles p ON p.id=x.producer_id
           WHERE x.id=$1 AND x.visible AND p.status='approved' AND NOT p.review_only`
        : `SELECT user_id AS owner FROM jdatna.producer_profiles WHERE id=$1 AND status='approved' AND NOT review_only`,
      [id],
    )
  ).rows[0] as { owner: string } | undefined;
  if (!target) throw new HttpError(404, "الصفحة غير موجودة");
  const agent = request.headers.get("user-agent") ?? "";
  const counts =
    !BOT.test(agent) && target.owner !== user?.id && Boolean(agent);
  if (counts) {
    // الزائر: حسابه إن كان مسجلًا، وإلا عنوانه مع متصفحه (مموّهين)؛ يتجدد كل يوم.
    const visitor = mask(
      user ? `user:${user.id}` : `anon:${clientIp(request) ?? ""}:${agent}`,
    );
    await db().query(
      `WITH seen AS (
         INSERT INTO jdatna.view_seen(kind,target_id,visitor,day)
         VALUES($1,$2,$3,(now() AT TIME ZONE 'Asia/Riyadh')::date)
         ON CONFLICT DO NOTHING RETURNING 1
       )
       INSERT INTO jdatna.view_counts(kind,target_id,views)
       SELECT $1,$2,1 FROM seen
       ON CONFLICT(kind,target_id) DO UPDATE SET views=jdatna.view_counts.views+1,updated_at=now()`,
      [kind, id, visitor],
    );
  }
  const views = Number(
    (
      await db().query(
        "SELECT views FROM jdatna.view_counts WHERE kind=$1 AND target_id=$2",
        [kind, id],
      )
    ).rows[0]?.views ?? 0,
  );
  const open = await viewsPublic();
  const manager = isManager(user);
  return open || manager
    ? { views, visible: true, adminOnly: !open }
    : { visible: false as const };
}

/** الإدارة ← «المشاهدات»: التفعيل للجميع، وأكثر المنتجات والأسر مشاهدة. */
export async function viewsAdmin(user: SessionUser) {
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const [open, products, producers] = await Promise.all([
    viewsPublic(),
    db().query(
      `SELECT x.id,x.name,COALESCE(p.trade_name,p.name) AS family,v.views::int AS views
       FROM jdatna.view_counts v JOIN jdatna.products x ON x.id=v.target_id JOIN jdatna.producer_profiles p ON p.id=x.producer_id
       WHERE v.kind='product' ORDER BY v.views DESC LIMIT 10`,
    ),
    db().query(
      `SELECT p.id,p.slug,COALESCE(p.trade_name,p.name) AS name,v.views::int AS views
       FROM jdatna.view_counts v JOIN jdatna.producer_profiles p ON p.id=v.target_id
       WHERE v.kind='producer' ORDER BY v.views DESC LIMIT 10`,
    ),
  ]);
  return {
    public: open,
    products: products.rows as {
      id: string;
      name: string;
      family: string;
      views: number;
    }[],
    producers: producers.rows as {
      id: string;
      slug: string;
      name: string;
      views: number;
    }[],
  };
}

export async function setViewsPublic(user: SessionUser, input: unknown) {
  if (!can(user, "content")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
  const { public: open } = z
    .object({ public: z.boolean() })
    .strict()
    .parse(input);
  await db().query(
    `INSERT INTO jdatna.site_settings(key,value,updated_at,updated_by) VALUES('views.public',$1,now(),$2)
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`,
    [open ? "on" : "off", user.id],
  );
  await db().query(
    "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES(gen_random_uuid(),$1,'site.views',$2)",
    [user.id, JSON.stringify({ public: open })],
  );
  return viewsAdmin(user);
}

const SITE = "00000000-0000-0000-0000-000000000000";
/** المتواجدون الآن: آخر ظهور لكل زائر في ذاكرة الخادم (نبضة كل دقيقتين من الصفحة المفتوحة). */
const presence: Map<string, number> = ((
  globalThis as unknown as { __jdatnaPresence?: Map<string, number> }
).__jdatnaPresence ??= new Map());
const ONLINE_MS = 5 * 60_000;

/**
 * زوار الموقع (أسفل كل صفحة): زوار اليوم، وإجمالي الزوار (زائر واحد لكل يوم)، والمتواجدون الآن
 * (آخر 5 دقائق). يُسجَّل الزائر دائمًا، ويظهر العدد للجميع إن فعّلته الإدارة وإلا للإدارة فقط.
 */
export async function recordVisit(request: Request, user: SessionUser | null) {
  if (!databaseConfigured()) return { visible: false as const };
  const agent = request.headers.get("user-agent") ?? "";
  const visitor = mask(
    user ? `user:${user.id}` : `anon:${clientIp(request) ?? ""}:${agent}`,
  );
  const now = Date.now();
  if (agent && !BOT.test(agent)) {
    presence.set(visitor, now);
    await db().query(
      `WITH seen AS (
         INSERT INTO jdatna.view_seen(kind,target_id,visitor,day)
         VALUES('site',$1,$2,(now() AT TIME ZONE 'Asia/Riyadh')::date)
         ON CONFLICT DO NOTHING RETURNING 1
       )
       INSERT INTO jdatna.view_counts(kind,target_id,views)
       SELECT 'site',$1,1 FROM seen
       ON CONFLICT(kind,target_id) DO UPDATE SET views=jdatna.view_counts.views+1,updated_at=now()`,
      [SITE, visitor],
    );
  }
  if (presence.size > 20_000 || Math.random() < 0.05)
    for (const [k, t] of presence) if (now - t > ONLINE_MS) presence.delete(k);
  const open = await viewsPublic();
  if (!open && !isManager(user)) return { visible: false as const };
  const [today, total] = await Promise.all([
    db().query(
      "SELECT count(*)::int AS n FROM jdatna.view_seen WHERE kind='site' AND day=(now() AT TIME ZONE 'Asia/Riyadh')::date",
    ),
    db().query(
      "SELECT views::int AS n FROM jdatna.view_counts WHERE kind='site' AND target_id=$1",
      [SITE],
    ),
  ]);
  let online = 0;
  for (const t of presence.values()) if (now - t <= ONLINE_MS) online++;
  return {
    visible: true as const,
    adminOnly: !open,
    today: today.rows[0].n as number,
    total: (total.rows[0]?.n as number | undefined) ?? 0,
    online: Math.max(online, 1),
  };
}
