/**
 * فحص شامل لفلاتر التصفح والبحث مقابل البيانات الفعلية (طلب المالك 2026-11-25).
 *
 * يزرع بيانات معروفة في قاعدة الاختبار (أسر في ثلاث مناطق، أقسام بأب وابن، منتجات بكل الحالات
 * ونطاقات التوصيل، أسر لا يجوز أن تظهر)، ثم يحسب النتيجة المتوقعة لكل تركيبة فلاتر بمنطق مستقل
 * في هذا الملف (oracle)، ويطابقها مع ما ترجعه دوال الموقع نفسها بعد المرور على كل الصفحات.
 * يتحقق أيضًا من: عدم تكرار النتائج بين الصفحات، واكتمالها، وزمن كل استعلام.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

type Seeded = {
  id: string;
  family: string;
  name: string;
  description: string;
  status: "available" | "preorder" | "unavailable";
  visible: boolean;
  deleted: boolean;
  scope: "coverage" | "kingdom";
  categories: string[];
};
type Family = {
  id: string;
  slug: string;
  name: string;
  city: string;
  region: string;
  status: string;
  reviewOnly: boolean;
  delivery: boolean;
  pickup: boolean;
  notCookingToday: boolean;
  categories: string[];
};

const AR = /[ً-ْٰـ]/g;
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(AR, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
const words = (q: string) =>
  norm(q)
    .split(/[\s،,]+/)
    .map((w) => (w.length > 4 && w.startsWith("ال") ? w.slice(2) : w))
    .map((w) => (w.length > 4 && w.endsWith("ه") ? w.slice(0, -1) : w))
    .filter(Boolean)
    .slice(0, 6);

test(
  "filters: every practical combination matches the seeded data, without duplicates, quickly",
  { skip: process.env.JDATNA_TEST_DB !== "true", timeout: 300_000 },
  async () => {
    const { db } = await import("../src/server/db");
    const {
      searchProducts,
      searchProducers,
      todayProducts,
      regionalProducts,
      regionalProducers,
    } = await import("../src/server/catalog");
    const pool = db();
    assert.match(
      (await pool.query("SELECT current_database() AS n")).rows[0].n,
      /^jdatna_test_/,
    );
    const tag = randomUUID().slice(0, 8);
    // كلمة مميزة في وصف كل منتج مزروع: البحث بها يحصر النتائج في بيانات هذا الاختبار.
    const mark = `فحصفلتر${tag.replace(/\d/g, "")}`;
    const regions = (
      await pool.query<{ region_id: string; ids: string[] }>(
        `SELECT region_id, (array_agg(id ORDER BY id))[1:2] AS ids FROM jdatna.cities
         GROUP BY region_id HAVING count(*)>=2 ORDER BY region_id LIMIT 3`,
      )
    ).rows;
    assert.equal(regions.length, 3, "ثلاث مناطق في كل منها مدينتان");
    const [A, B, C] = regions;

    // أقسام: أب وابنه، وقسم مستقل.
    const parent = `ft-p-${tag}`,
      child = `ft-c-${tag}`,
      other = `ft-o-${tag}`;
    const users: string[] = [];
    const families: Family[] = [];
    const products: Seeded[] = [];
    const timings: { label: string; ms: number }[] = [];

    try {
      await pool.query(
        `INSERT INTO jdatna.categories(id,name,slug,parent_id) VALUES
         ($1,'حلويات فحص',$1,NULL),($2,'كليجا فحص',$2,$1),($3,'مشروبات فحص',$3,NULL)`,
        [parent, child, other],
      );
      const fam = async (
        f: Omit<Family, "id" | "slug"> & { label: string },
      ): Promise<Family> => {
        const user = randomUUID(),
          id = randomUUID();
        users.push(user);
        const phone =
          "+9665" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
        await pool.query(
          "INSERT INTO jdatna.users(id,name,phone,role,phone_verified_at) VALUES($1,$2,$3,'producer',now())",
          [user, f.label, phone],
        );
        const slug = `ft-${f.label}-${tag}`;
        await pool.query(
          `INSERT INTO jdatna.producer_profiles(id,user_id,slug,name,trade_name,city_id,phone,status,review_only,delivery,pickup)
           VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
            user,
            slug,
            f.name,
            f.city,
            phone,
            f.status,
            f.reviewOnly,
            f.delivery,
            f.pickup,
          ],
        );
        for (const c of f.categories)
          await pool.query(
            "INSERT INTO jdatna.producer_categories(producer_id,category_id) VALUES($1,$2)",
            [id, c],
          );
        if (f.notCookingToday)
          await pool.query(
            `INSERT INTO jdatna.producer_cooking_days(producer_id,day)
             VALUES($1,(now() AT TIME ZONE 'Asia/Riyadh')::date)`,
            [id],
          );
        const out = { ...f, id, slug };
        families.push(out);
        return out;
      };
      const prod = async (
        family: Family,
        p: Omit<Seeded, "id" | "family" | "description"> & {
          extra?: string;
          /** وقت إنشاء واحد لكل المنتجات (استيراد جماعي): يكشف عدم ثبات الترتيب بين الصفحات. */
          sameTime?: boolean;
        },
      ) => {
        const id = randomUUID();
        const description = `${mark} ${p.extra ?? ""}`.trim();
        await pool.query(
          `INSERT INTO jdatna.products(id,producer_id,name,description,unit,status,visible,delivery_scope,deleted_at,created_at)
           VALUES($1,$2,$3,$4,'صحن',$5,$6,$7,$8,now()-($9::int * interval '1 second'))`,
          [
            id,
            family.id,
            p.name,
            description,
            p.status,
            p.visible,
            p.scope,
            p.deleted ? new Date() : null,
            p.sameTime ? 0 : products.length,
          ],
        );
        for (const c of p.categories)
          await pool.query(
            "INSERT INTO jdatna.product_categories(product_id,category_id) VALUES($1,$2)",
            [id, c],
          );
        products.push({ ...p, id, family: family.id, description });
      };

      const a1 = await fam({
        label: "a1",
        name: "مطبخ الريم",
        city: A.ids[0],
        region: A.region_id,
        status: "approved",
        reviewOnly: false,
        delivery: true,
        pickup: true,
        notCookingToday: false,
        categories: [parent],
      });
      const a2 = await fam({
        label: "a2",
        name: "بيت الجدة",
        city: A.ids[1],
        region: A.region_id,
        status: "approved",
        reviewOnly: false,
        delivery: false,
        pickup: true,
        notCookingToday: true,
        categories: [child, other],
      });
      const b1 = await fam({
        label: "b1",
        name: "أكلات الشمال",
        city: B.ids[0],
        region: B.region_id,
        status: "approved",
        reviewOnly: false,
        delivery: true,
        pickup: false,
        notCookingToday: false,
        categories: [other],
      });
      // لا يجوز أن تظهر أبدًا: بانتظار الاعتماد، وأسرة مراجعة المتاجر، وموقوفة.
      const hidden = [
        await fam({
          label: "pend",
          name: "أسرة معلقة",
          city: C.ids[0],
          region: C.region_id,
          status: "pending",
          reviewOnly: false,
          delivery: true,
          pickup: true,
          notCookingToday: false,
          categories: [parent],
        }),
        await fam({
          label: "rev",
          name: "أسرة مراجعة",
          city: A.ids[0],
          region: A.region_id,
          status: "approved",
          reviewOnly: true,
          delivery: true,
          pickup: true,
          notCookingToday: false,
          categories: [parent],
        }),
        await fam({
          label: "susp",
          name: "أسرة موقوفة",
          city: B.ids[1],
          region: B.region_id,
          status: "suspended",
          reviewOnly: false,
          delivery: true,
          pickup: true,
          notCookingToday: false,
          categories: [other],
        }),
      ];

      // منتجات a1: كل الحالات، وصور الكتابة العربية المختلفة، وأقسام الأب والابن.
      await prod(a1, {
        name: "مرقوقة باللحم",
        status: "available",
        visible: true,
        deleted: false,
        scope: "coverage",
        categories: [parent],
      });
      await prod(a1, {
        name: "كليجا بالتمر",
        status: "available",
        visible: true,
        deleted: false,
        scope: "kingdom",
        categories: [child],
      });
      await prod(a1, {
        name: "قرصان",
        status: "preorder",
        visible: true,
        deleted: false,
        scope: "coverage",
        categories: [other],
      });
      await prod(a1, {
        name: "جريش أبيض",
        status: "unavailable",
        visible: true,
        deleted: false,
        scope: "coverage",
        categories: [parent],
      });
      await prod(a1, {
        name: "مخفي من الأسرة",
        status: "available",
        visible: false,
        deleted: false,
        scope: "coverage",
        categories: [parent],
      });
      await prod(a1, {
        name: "محذوف",
        status: "available",
        visible: false,
        deleted: true,
        scope: "coverage",
        categories: [parent],
      });
      // محذوف أُعيد إظهاره خطأً (visible=true): لا يظهر أبدًا.
      await prod(a1, {
        name: "محذوف ظاهر",
        status: "available",
        visible: true,
        deleted: true,
        scope: "coverage",
        categories: [parent],
      });
      // a2 لا تطبخ اليوم: متاحها لا يدخل «المتاح الآن».
      await prod(a2, {
        name: "مرقوق خضار",
        status: "available",
        visible: true,
        deleted: false,
        scope: "coverage",
        categories: [child],
      });
      await prod(a2, {
        name: "قهوة عربية",
        status: "preorder",
        visible: true,
        deleted: false,
        scope: "kingdom",
        categories: [other],
      });
      // b1: 30 منتجًا لاختبار الترقيم (24 في الصفحة) بلا تكرار ولا نقص.
      for (let i = 0; i < 30; i++)
        await prod(b1, {
          name: `حلى رقم ${i + 1}`,
          status: i % 3 === 0 ? "preorder" : "available",
          visible: true,
          deleted: false,
          scope: i % 5 === 0 ? "kingdom" : "coverage",
          categories: [i % 2 ? other : child],
          extra: "حلى",
        });
      // c1: 60 منتجًا بوقت إنشاء واحد (كاستيراد جماعي) لاختبار ثبات الترتيب بين الصفحات.
      const c1 = await fam({
        label: "c1",
        name: "مخبز الجنوب",
        city: C.ids[1],
        region: C.region_id,
        status: "approved",
        reviewOnly: false,
        delivery: true,
        pickup: true,
        notCookingToday: false,
        categories: [other],
      });
      for (let i = 0; i < 60; i++)
        await prod(c1, {
          name: `خبز ${i + 1}`,
          status: "available",
          visible: true,
          deleted: false,
          scope: "coverage",
          categories: [other],
          sameTime: true,
        });
      for (const h of hidden)
        await prod(h, {
          name: `ممنوع ${h.slug}`,
          status: "available",
          visible: true,
          deleted: false,
          scope: "kingdom",
          categories: [parent],
        });

      // ===== المنطق المستقل (oracle) =====
      const byId = new Map(families.map((f) => [f.id, f]));
      const catName = new Map([
        [parent, "حلويات فحص"],
        [child, "كليجا فحص"],
        [other, "مشروبات فحص"],
      ]);
      const descendants = (c: string) => (c === parent ? [parent, child] : [c]);
      type F = {
        q?: string;
        region?: string;
        city?: string;
        category?: string;
        status?: string;
        include?: string;
        delivery?: string;
        producer?: string;
        scope?: string;
      };
      const expected = (f: F) =>
        products
          .filter((p) => {
            const fam = byId.get(p.family)!;
            if (fam.status !== "approved" || fam.reviewOnly) return false;
            if (!p.visible || p.deleted) return false;
            for (const w of words(`${mark} ${f.q ?? ""}`)) {
              const hay = [
                p.name,
                p.description,
                fam.name,
                ...p.categories.map((c) => catName.get(c)!),
              ].map(norm);
              if (!hay.some((h) => h.includes(w))) return false;
            }
            if (f.producer && fam.slug !== f.producer) return false;
            if (f.region && fam.region !== f.region) return false;
            if (f.city && fam.city !== f.city) return false;
            if (f.scope === "kingdom" && p.scope !== "kingdom") return false;
            if (
              f.category &&
              !p.categories.some((c) => descendants(f.category!).includes(c))
            )
              return false;
            if (f.status) {
              if (p.status !== f.status) return false;
              if (f.status === "available" && fam.notCookingToday) return false;
            } else if (f.include !== "all" && p.status === "unavailable")
              return false;
            if (f.delivery === "true" && !fam.delivery) return false;
            if (f.delivery === "pickup" && !fam.pickup) return false;
            return true;
          })
          .map((p) => p.id)
          .sort();

      // كل الصفحات، مع قياس الزمن وكشف التكرار.
      const all = async (f: F, label: string) => {
        const ids: string[] = [];
        for (let page = 1; page < 20; page++) {
          const t0 = performance.now();
          const rows = await searchProducts({
            ...f,
            q: `${mark} ${f.q ?? ""}`.trim(),
            page,
          });
          timings.push({ label, ms: performance.now() - t0 });
          ids.push(...rows.map((r) => r.id));
          if (rows.length < 24) break;
        }
        assert.equal(
          new Set(ids).size,
          ids.length,
          `${label}: نتيجة مكررة بين الصفحات`,
        );
        return ids.sort();
      };

      const options: Record<keyof F, (string | undefined)[]> = {
        q: [
          undefined,
          "مرقوقه",
          "المرقوق",
          "كليجا",
          "حلويات",
          "الشمال",
          "حلى رقم 2",
        ],
        region: [undefined, A.region_id, B.region_id, C.region_id],
        city: [undefined, A.ids[0], A.ids[1]],
        category: [undefined, parent, child, other],
        status: [undefined, "available", "preorder", "unavailable"],
        include: [undefined, "all"],
        delivery: [undefined, "true", "pickup"],
        producer: [undefined, a1.slug, b1.slug, hidden[1].slug],
        scope: [undefined, "kingdom"],
      };
      // كل فلتر منفردًا بكل قيمه، ثم كل زوج من الفلاتر بكل قيمهما، ثم تركيبات ثلاثية مختارة.
      const keys = Object.keys(options) as (keyof F)[];
      const cases: F[] = [{}];
      for (const k of keys)
        for (const v of options[k]) if (v) cases.push({ [k]: v });
      for (let i = 0; i < keys.length; i++)
        for (let j = i + 1; j < keys.length; j++)
          for (const v1 of options[keys[i]])
            for (const v2 of options[keys[j]])
              if (v1 && v2) cases.push({ [keys[i]]: v1, [keys[j]]: v2 });
      cases.push(
        { region: A.region_id, category: parent, status: "available" },
        { region: A.region_id, category: child, delivery: "pickup" },
        { region: B.region_id, q: "حلى", status: "preorder", scope: "kingdom" },
        { city: A.ids[1], category: parent, include: "all" },
        { producer: b1.slug, category: child, status: "available" },
      );
      const failures: string[] = [];
      for (const f of cases) {
        const label = JSON.stringify(f);
        const got = await all(f, label);
        const want = expected(f);
        if (JSON.stringify(got) !== JSON.stringify(want))
          failures.push(
            `${label}: got ${got.length}, expected ${want.length}; extra=${got.filter((x) => !want.includes(x)).length} missing=${want.filter((x) => !got.includes(x)).length}`,
          );
      }
      assert.deepEqual(
        failures,
        [],
        `${failures.length} تركيبة لا تطابق البيانات`,
      );

      // الترقيم: صفحتا b1 (30 منتجًا ظاهرًا) كاملتان بلا تكرار.
      const b1All = await all({ producer: b1.slug }, "b1 pages");
      assert.equal(b1All.length, 30);
      // 60 منتجًا بوقت إنشاء واحد: ثلاث صفحات كاملة بلا تكرار ولا نقص.
      const c1All = await all({ producer: c1.slug }, "c1 same-time pages");
      assert.equal(c1All.length, 60, "منتجات ناقصة بين الصفحات");

      // الأسر: الظاهرة فقط، وبالمنطقة والمدينة والقسم.
      const famIds = async (f: F) =>
        (await searchProducers({ ...f }))
          .map((p) => p.id)
          .filter((id) => byId.has(id))
          .sort();
      const visibleFams = [a1, a2, b1, c1].map((f) => f.id).sort();
      assert.deepEqual(await famIds({}), visibleFams, "الأسر الظاهرة فقط");
      assert.deepEqual(
        await famIds({ region: A.region_id }),
        [a1.id, a2.id].sort(),
      );
      assert.deepEqual(await famIds({ city: A.ids[1] }), [a2.id]);
      // القسم الأب يشمل الأسرة التي في قسمه الابن.
      assert.deepEqual(
        await famIds({ category: parent }),
        [a1.id, a2.id].sort(),
      );
      assert.deepEqual(await famIds({ q: "الجدة" }), [a2.id]);

      // مائدة اليوم: المتاح فقط، وليس من أسرة لا تطبخ اليوم.
      const today = (await todayProducts({ region: A.region_id }, 200))
        .map((p) => p.id)
        .filter((id) => products.some((p) => p.id === id))
        .sort();
      assert.deepEqual(
        today,
        expected({ region: A.region_id, status: "available" }),
      );

      // التصفح بالمنطقة: منتجات المنطقة، ثم «يُشحن لكل المناطق» من خارجها، بلا تكرار بين القسمين.
      const seeded = new Set(products.map((p) => p.id));
      const regional = await regionalProducts(
        { q: mark, region: A.region_id },
        200,
      );
      const local = regional.local
        .map((p) => p.id)
        .filter((id) => seeded.has(id));
      const nation = regional.nationwide
        .map((p) => p.id)
        .filter((id) => seeded.has(id));
      assert.deepEqual(local.sort(), expected({ region: A.region_id }));
      const kingdomOutside = products
        .filter((p) => {
          const f = byId.get(p.family)!;
          return (
            f.status === "approved" &&
            !f.reviewOnly &&
            p.visible &&
            !p.deleted &&
            p.status !== "unavailable" &&
            p.scope === "kingdom" &&
            f.region !== A.region_id
          );
        })
        .map((p) => p.id)
        .sort();
      assert.deepEqual(
        nation.sort(),
        kingdomOutside,
        "«يُشحن لكل المناطق» من خارج المنطقة فقط",
      );
      assert.equal(
        local.filter((id) => nation.includes(id)).length,
        0,
        "منتج مكرر بين المنطقة والمملكة",
      );
      const regionalFams = await regionalProducers({ region: B.region_id });
      assert.deepEqual(
        regionalFams.local.map((p) => p.id).filter((id) => byId.has(id)),
        [b1.id],
      );
      assert.ok(
        !regionalFams.nationwide.some((p) => p.id === b1.id),
        "أسرة المنطقة لا تتكرر في «لكل المناطق»",
      );

      // السرعة: كل استعلام فلترة تحت 500ms على قاعدة الاختبار، والمتوسط تحت 60ms.
      const slow = timings.filter((t) => t.ms > 500);
      const avg = timings.reduce((s, t) => s + t.ms, 0) / timings.length;
      console.log(
        `filters: ${cases.length} combinations, ${timings.length} queries, avg ${avg.toFixed(1)}ms, max ${Math.max(...timings.map((t) => t.ms)).toFixed(1)}ms`,
      );
      assert.deepEqual(slow, [], "استعلامات بطيئة");
      assert.ok(avg < 60, `متوسط زمن الاستعلام ${avg.toFixed(1)}ms`);
    } finally {
      await pool.query(
        "DELETE FROM jdatna.product_categories WHERE product_id=ANY($1::uuid[])",
        [products.map((p) => p.id)],
      );
      await pool.query("DELETE FROM jdatna.products WHERE id=ANY($1::uuid[])", [
        products.map((p) => p.id),
      ]);
      const fids = families.map((f) => f.id);
      for (const t of ["producer_categories", "producer_cooking_days"])
        await pool.query(
          `DELETE FROM jdatna.${t} WHERE producer_id=ANY($1::uuid[])`,
          [fids],
        );
      await pool.query(
        "DELETE FROM jdatna.producer_profiles WHERE id=ANY($1::uuid[])",
        [fids],
      );
      await pool.query("DELETE FROM jdatna.users WHERE id=ANY($1::uuid[])", [
        users,
      ]);
      await pool.query("DELETE FROM jdatna.categories WHERE id=ANY($1)", [
        [child, parent, other],
      ]);
      await pool.end();
    }
  },
);
