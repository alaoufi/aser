import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { can, isManager } from "../lib/permissions";
import { db, databaseConfigured } from "./db";
import { HttpError } from "./security";
import { clientIp, mask, sourceKey } from "./security-events";
import { rateLimit } from "./auth";

/**
 * حد لكل عنوان للعدّادات (مراجعة 2026-11-24): ما زاد يُرد عاديًا بلا عدّ ولا خطأ للزائر،
 * فلا يرفع سكربت المشاهدات أو الزوار بتغيير المتصفح.
 */
async function countAllowed(request: Request, bucket: string, max: number) {
  const source = sourceKey(request);
  if (!source) return true;
  return rateLimit(`${bucket}:${source}`, max, 60).then(
    () => true,
    () => false,
  );
}

/**
 * المشاهدات: تُحسب دائمًا لصفحة المنتج وصفحة الأسرة (الموقع والتطبيقان يعرضان الصفحات نفسها).
 * مشاهدة واحدة لكل زائر لكل صفحة في اليوم؛ لا تُحسب زيارة صاحب الأسرة لصفحاته ولا محركات البحث.
 * ظهور العدد: للجميع إن فعّلته الإدارة، وإلا لمن له صلاحية في الإدارة فقط.
 */
const viewSchema = z
  .object({ kind: z.enum(["product", "producer"]), id: z.uuid() })
  .strict();
export const BOT =
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
    !BOT.test(agent) &&
    target.owner !== user?.id &&
    Boolean(agent) &&
    (await countAllowed(request, "views-ip", 60));
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
  // مقترح لك: ما فتحه العضو المسجّل من منتجات (لا الزوار، ولا صاحب المنتج نفسه).
  if (kind === "product" && user && target.owner !== user.id)
    await db()
      .query(
        `INSERT INTO jdatna.member_product_views(user_id,product_id) VALUES($1,$2)
         ON CONFLICT(user_id,product_id) DO UPDATE SET views=jdatna.member_product_views.views+1,last_at=now()`,
        [user.id, id],
      )
      .catch(() => {});
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
  if (!open && !manager) return { visible: false as const };
  if (kind === "product") return { views, visible: true, adminOnly: !open };
  // صفحة الأسرة: مع عدد صفحتها، إجمالي مشاهدات منتجاتها الظاهرة وعدد كل منتج.
  const products = await productViews(id, true);
  return {
    views,
    visible: true,
    adminOnly: !open,
    productsViews: products.reduce((n, p) => n + p.views, 0),
    products: Object.fromEntries(products.map((p) => [p.id, p.views])),
  };
}

/** مشاهدات منتجات أسرة: الظاهرة فقط للصفحة العامة، وكلها للوحة الأسرة. */
async function productViews(producerId: string, visibleOnly: boolean) {
  return (
    await db().query(
      `SELECT x.id,x.name,x.visible,COALESCE(v.views,0)::int AS views
       FROM jdatna.products x
       LEFT JOIN jdatna.view_counts v ON v.kind='product' AND v.target_id=x.id
       WHERE x.producer_id=$1 AND x.deleted_at IS NULL ${visibleOnly ? "AND x.visible" : ""}
       ORDER BY views DESC, x.created_at DESC`,
      [producerId],
    )
  ).rows as { id: string; name: string; visible: boolean; views: number }[];
}

/**
 * لوحة الأسرة ← «المشاهدات»: مشاهدات صفحة الأسرة، وإجمالي مشاهدات منتجاتها، وعدد كل منتج.
 * أرقام الأسرة نفسها تظهر لها دائمًا (لا لغيرها)، أيًّا كان إعداد الظهور العام.
 */
export async function familyViews(user: SessionUser) {
  const family = (
    await db().query(
      "SELECT id,slug FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0] as { id: string; slug: string } | undefined;
  if (!family) throw new HttpError(404, "لا يوجد ملف أسرة منتجة لهذا الحساب");
  const [page, products, open] = await Promise.all([
    db().query(
      "SELECT views::int AS n FROM jdatna.view_counts WHERE kind='producer' AND target_id=$1",
      [family.id],
    ),
    productViews(family.id, false),
    viewsPublic(),
  ]);
  return {
    slug: family.slug,
    public: open,
    pageViews: (page.rows[0]?.n as number | undefined) ?? 0,
    productsViews: products.reduce((n, p) => n + p.views, 0),
    products,
  };
}

/** الإدارة ← «المشاهدات»: التفعيل للجميع، وأكثر المنتجات والأسر مشاهدة. */
export async function viewsAdmin(user: SessionUser) {
  if (!can(user, "views")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
  if (!can(user, "views")) throw new HttpError(403, "لا تملك صلاحية الإدارة");
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
 * زوار الموقع (أسفل كل صفحة): زيارات اليوم، وإجمالي الزيارات، والمتواجدون الآن (آخر 5 دقائق).
 * قرار المالك 2026-11-26: كل فتح أو تحديث للصفحة زيارة (hit)، ولو تكرر من الزائر نفسه.
 * نبضة «ما زال هنا» كل دقيقتين لا تُحسب زيارة، فالصفحة المفتوحة لا تضخّم العدد.
 * يظهر العدد للجميع إن فعّلته الإدارة وإلا للإدارة فقط.
 */
export async function recordVisit(
  request: Request,
  user: SessionUser | null,
  hit = true,
) {
  if (!databaseConfigured()) return { visible: false as const };
  const agent = request.headers.get("user-agent") ?? "";
  const visitor = mask(
    user ? `user:${user.id}` : `anon:${clientIp(request) ?? ""}:${agent}`,
  );
  const now = Date.now();
  if (
    agent &&
    !BOT.test(agent) &&
    (await countAllowed(request, "visits-ip", 60))
  ) {
    presence.set(visitor, now);
    if (hit)
      await db().query(
        `WITH seen AS (
           -- الزوار المختلفون لكل يوم (للإحصاءات).
           INSERT INTO jdatna.view_seen(kind,target_id,visitor,day)
           VALUES('site',$1,$2,(now() AT TIME ZONE 'Asia/Riyadh')::date)
           ON CONFLICT DO NOTHING
         ), daily AS (
           INSERT INTO jdatna.site_visits_daily(day,visits)
           VALUES((now() AT TIME ZONE 'Asia/Riyadh')::date,1)
           ON CONFLICT(day) DO UPDATE SET visits=jdatna.site_visits_daily.visits+1
         )
         INSERT INTO jdatna.view_counts(kind,target_id,views) VALUES('site',$1,1)
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
      "SELECT COALESCE((SELECT visits::int FROM jdatna.site_visits_daily WHERE day=(now() AT TIME ZONE 'Asia/Riyadh')::date),0) AS n",
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
