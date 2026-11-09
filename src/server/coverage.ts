import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionUser } from "../lib/types";
import { db, transaction } from "./db";
import { HttpError } from "./security";
import { compareRegions } from "../lib/regions";
export type CoverageKind =
  "region" | "governorate" | "city" | "center" | "neighborhood";
export type CoverageNode = {
  id: string;
  kind: CoverageKind;
  name: string;
  parentId: string | null;
  regionId: string;
  cityId: string | null;
  legacy: boolean;
  label: string;
};
export type CoverageArea = {
  nodeId: string;
  fee: number | null;
  label?: string;
};
export type CustomCoverageArea = {
  cityNodeId: string;
  center?: string | null;
  neighborhood?: string | null;
  fee?: number | null;
  label?: string;
};
const coverageFee = z
  .number()
  .min(0)
  .max(99999999.99)
  .multipleOf(0.01)
  .nullable()
  .optional();
const coveragePlaceName = z
  .string()
  .trim()
  .max(120)
  .transform((name) => name.normalize("NFC") || null)
  .nullable()
  .optional();
const customAreaSchema = z
  .object({
    cityNodeId: z.string().min(1).max(160),
    center: coveragePlaceName,
    neighborhood: coveragePlaceName,
    fee: coverageFee,
  })
  .strict()
  .refine(
    (area) => Boolean(area.center || area.neighborhood),
    "أدخل اسم المركز أو الحي",
  );
function customCoverageKey(area: CustomCoverageArea) {
  return JSON.stringify([
    area.cityNodeId,
    area.center?.trim().normalize("NFC").toLowerCase() || "",
    area.neighborhood?.trim().normalize("NFC").toLowerCase() || "",
  ]);
}
export const coverageSchema = z
  .object({
    areas: z
      .array(
        z
          .object({
            nodeId: z.string().min(1).max(160),
            fee: z
              .number()
              .min(0)
              .max(99999999.99)
              .multipleOf(0.01)
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(100),
    customAreas: z.array(customAreaSchema).max(100).optional(),
  })
  .strict()
  .refine(
    (v) => new Set(v.areas.map((a) => a.nodeId)).size === v.areas.length,
    "لا تكرر نطاق التغطية",
  )
  .refine(
    (value) => value.areas.length + (value.customAreas?.length ?? 0) <= 100,
    "يمكن حفظ مئة نطاق تغطية كحد أقصى",
  )
  .refine(
    (value) =>
      !value.customAreas ||
      new Set(value.customAreas.map(customCoverageKey)).size ===
        value.customAreas.length,
    "لا تكرر المركز أو الحي في المدينة نفسها",
  );
export const nodeSchema = z
  .object({
    kind: z.enum(["governorate", "city", "center", "neighborhood"]),
    parentId: z.string().min(1).max(160),
    name: z.string().trim().min(1).max(120).optional(),
    cityId: z.string().min(1).max(120).optional(),
  })
  .strict()
  .refine(
    (v) => (v.kind === "city" ? !!v.cityId : !!v.name),
    "حدد الاسم أو المدينة القائمة",
  );
export function validCoverageParent(kind: CoverageKind, parent: CoverageKind) {
  return kind === "governorate"
    ? parent === "region"
    : kind === "city"
      ? parent === "governorate"
      : kind === "center"
        ? parent === "city"
        : kind === "neighborhood"
          ? parent === "city" || parent === "center"
          : false;
}
export function requireCoverageAdmin(user: { role: string }) {
  if (user.role !== "admin")
    throw new HttpError(403, "هذه العملية للإدارة فقط");
}
export async function getCoverageTree(): Promise<CoverageNode[]> {
  const rows = (
    await db().query(`WITH RECURSIVE tree AS (
 SELECT n.*,n.name::text AS label,false AS legacy FROM jdatna.coverage_nodes n WHERE parent_id IS NULL
 UNION ALL SELECT n.*,t.label||' / '||CASE WHEN n.kind='city' AND t.kind='region' THEN 'مدن القائمة السابقة (غير مصنفة لمحافظة) / ' ELSE '' END||n.name,(n.kind='city' AND t.kind='region') OR t.legacy FROM jdatna.coverage_nodes n JOIN tree t ON n.parent_id=t.id
 ) SELECT id,kind,name,parent_id AS "parentId",region_id AS "regionId",city_id AS "cityId",legacy,label FROM tree ORDER BY label`)
  ).rows;
  const regionNames = new Map<string, string>(
    rows
      .filter((node) => node.kind === "region")
      .map((node) => [node.regionId, node.name]),
  );
  return rows.sort((a, b) =>
    compareRegions(
      { id: a.regionId, name: regionNames.get(a.regionId) ?? a.regionId },
      { id: b.regionId, name: regionNames.get(b.regionId) ?? b.regionId },
    ),
  );
}
export async function ownCoverage(user: SessionUser) {
  const producer = (
    await db().query(
      "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1",
      [user.id],
    )
  ).rows[0];
  if (!producer) throw new HttpError(404, "أنشئ ملف الأسرة أولًا");
  const areas = (
    await db().query(
      'SELECT node_id AS "nodeId",fee::float8 AS fee FROM jdatna.producer_coverage WHERE producer_id=$1',
      [producer.id],
    )
  ).rows as CoverageArea[];
  const legacyAreas = (
    await db().query(
      "SELECT c.name AS label,d.fee::float8 AS fee FROM jdatna.delivery_areas d JOIN jdatna.cities c ON c.id=d.city_id WHERE d.producer_id=$1",
      [producer.id],
    )
  ).rows;
  const customAreas = (
    await db().query(
      `SELECT d.city_node_id AS "cityNodeId",d.center,d.neighborhood,d.fee::float8 AS fee,
     concat_ws(' / ',n.name,d.center,d.neighborhood) AS label
     FROM jdatna.producer_coverage_details d JOIN jdatna.coverage_nodes n ON n.id=d.city_node_id
     WHERE d.producer_id=$1 ORDER BY n.name,d.center,d.neighborhood`,
      [producer.id],
    )
  ).rows as CustomCoverageArea[];
  return { areas, legacyAreas, customAreas };
}
export async function saveCoverage(user: SessionUser, input: unknown) {
  const value = coverageSchema.parse(input);
  return transaction(async (client) => {
    const producer = (
      await client.query(
        `SELECT p.id,(SELECT count(*) FROM jdatna.producer_coverage_details d WHERE d.producer_id=p.id) AS "customCount"
         FROM jdatna.producer_profiles p WHERE p.user_id=$1 FOR UPDATE`,
        [user.id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "أنشئ ملف الأسرة أولًا");
    // Older clients omit customAreas; count their preserved rows under the same owner lock.
    const customCount =
      value.customAreas?.length ?? Number(producer.customCount ?? 0);
    if (value.areas.length + customCount > 100)
      throw new HttpError(400, "يمكن حفظ مئة نطاق تغطية كحد أقصى");
    const ids = value.areas.map((a) => a.nodeId);
    const found = (
      await client.query(
        "SELECT id FROM jdatna.coverage_nodes WHERE id=ANY($1::text[]) AND kind IN ('city','center','neighborhood')" +
          (value.customAreas === undefined
            ? " AND ($2::int+(SELECT count(*) FROM jdatna.producer_coverage_details WHERE producer_id=$3))<=100"
            : ""),
        value.customAreas === undefined
          ? [ids, ids.length, producer.id]
          : [ids],
      )
    ).rows;
    if (found.length !== ids.length)
      throw new HttpError(400, "اختر مدينة أو مركزًا أو حيًا قائمًا");
    if (value.customAreas !== undefined) {
      const cityIds = [
        ...new Set(value.customAreas.map((area) => area.cityNodeId)),
      ];
      const cities = (
        await client.query(
          "SELECT id FROM jdatna.coverage_nodes WHERE id=ANY($1::text[]) AND kind='city' FOR KEY SHARE",
          [cityIds],
        )
      ).rows;
      if (cities.length !== cityIds.length)
        throw new HttpError(400, "اختر مدينة قائمة للأحياء والمراكز");
    }
    await client.query(
      "DELETE FROM jdatna.producer_coverage WHERE producer_id=$1",
      [producer.id],
    );
    for (const a of value.areas)
      await client.query(
        "INSERT INTO jdatna.producer_coverage(producer_id,node_id,fee) VALUES($1,$2,$3)",
        [producer.id, a.nodeId, a.fee ?? null],
      );
    if (value.customAreas !== undefined) {
      await client.query(
        "DELETE FROM jdatna.producer_coverage_details WHERE producer_id=$1",
        [producer.id],
      );
      for (const area of value.customAreas)
        await client.query(
          "INSERT INTO jdatna.producer_coverage_details(producer_id,city_node_id,center,neighborhood,fee) VALUES($1,$2,$3,$4,$5)",
          [
            producer.id,
            area.cityNodeId,
            area.center ?? null,
            area.neighborhood ?? null,
            area.fee ?? null,
          ],
        );
    }
    return { ok: true };
  });
}
export async function curateCoverage(user: SessionUser, input: unknown) {
  requireCoverageAdmin(user);
  const value = nodeSchema.parse(input);
  return transaction(async (client) => {
    const parent = (
      await client.query(
        "SELECT * FROM jdatna.coverage_nodes WHERE id=$1 FOR SHARE",
        [value.parentId],
      )
    ).rows[0];
    if (!parent || !validCoverageParent(value.kind, parent.kind))
      throw new HttpError(400, "المستوى الإداري الأب غير صحيح");
    let id: string;
    if (value.kind === "city") {
      id = "city:" + value.cityId;
      const city = (
        await client.query(
          "SELECT * FROM jdatna.coverage_nodes WHERE id=$1 AND kind='city' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !city ||
        city.region_id !== parent.region_id ||
        city.parent_id !== "region:" + city.region_id
      )
        throw new HttpError(
          400,
          "المدينة ليست ضمن المنطقة أو سبق تصنيفها؛ لا يمكن نقلها",
        );
      await client.query(
        "UPDATE jdatna.coverage_nodes SET parent_id=$2 WHERE id=$1",
        [id, parent.id],
      );
    } else {
      // Detailed nodes require an explicitly curated city ancestry.
      if (
        parent.kind === "city" &&
        parent.parent_id === "region:" + parent.region_id
      )
        throw new HttpError(400, "صنف المدينة ضمن المحافظة أولًا");
      id = randomUUID();
      await client.query(
        "INSERT INTO jdatna.coverage_nodes(id,kind,name,parent_id,region_id) VALUES($1,$2,$3,$4,$5)",
        [id, value.kind, value.name, parent.id, parent.region_id],
      );
    }
    await client.query(
      "INSERT INTO jdatna.admin_audit_logs(id,actor_id,action,details) VALUES($1,$2,'coverage.curate',$3::jsonb)",
      [randomUUID(), user.id, JSON.stringify({ nodeId: id, ...value })],
    );
    return { id };
  });
}
export async function getPublicCoverage(
  producerId: string,
): Promise<CoverageArea[]> {
  if (!/^[0-9a-f-]{36}$/i.test(producerId)) return [];
  const rows = (
    await db().query(
      `SELECT pc.node_id AS "nodeId",pc.fee::float8 AS fee FROM jdatna.producer_coverage pc JOIN jdatna.producer_profiles p ON p.id=pc.producer_id WHERE p.id=$1 AND p.status='approved'`,
      [producerId],
    )
  ).rows;
  const legacy = (
    await db().query(
      `SELECT 'legacy:'||d.city_id AS "nodeId",c.name||' (تغطية التوصيل السابقة)' AS label,d.fee::float8 AS fee FROM jdatna.delivery_areas d JOIN jdatna.cities c ON c.id=d.city_id JOIN jdatna.producer_profiles p ON p.id=d.producer_id WHERE p.id=$1 AND p.status='approved' AND NOT EXISTS(SELECT 1 FROM jdatna.producer_coverage pc WHERE pc.producer_id=p.id AND pc.node_id='city:'||d.city_id)
       UNION ALL
       SELECT 'detail:'||d.id::text AS "nodeId",concat_ws(' / ',n.name,d.center,d.neighborhood) AS label,d.fee::float8 AS fee
       FROM jdatna.producer_coverage_details d JOIN jdatna.coverage_nodes n ON n.id=d.city_node_id JOIN jdatna.producer_profiles p ON p.id=d.producer_id
       WHERE p.id=$1 AND p.status='approved'`,
      [producerId],
    )
  ).rows;
  if (!rows.length) return legacy;
  const tree = await getCoverageTree();
  return [
    ...rows.map((a) => ({
      ...a,
      label: tree.find((n) => n.id === a.nodeId)?.label ?? "نطاق تغطية",
    })),
    ...legacy,
  ];
}
