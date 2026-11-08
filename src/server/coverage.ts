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
  })
  .strict()
  .refine(
    (v) => new Set(v.areas.map((a) => a.nodeId)).size === v.areas.length,
    "لا تكرر نطاق التغطية",
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
  return { areas, legacyAreas };
}
export async function saveCoverage(user: SessionUser, input: unknown) {
  const value = coverageSchema.parse(input);
  return transaction(async (client) => {
    const producer = (
      await client.query(
        "SELECT id FROM jdatna.producer_profiles WHERE user_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (!producer) throw new HttpError(404, "أنشئ ملف الأسرة أولًا");
    const ids = value.areas.map((a) => a.nodeId);
    const found = (
      await client.query(
        "SELECT id FROM jdatna.coverage_nodes WHERE id=ANY($1::text[]) AND kind IN ('city','center','neighborhood')",
        [ids],
      )
    ).rows;
    if (found.length !== ids.length)
      throw new HttpError(400, "اختر مدينة أو مركزًا أو حيًا قائمًا");
    await client.query(
      "DELETE FROM jdatna.producer_coverage WHERE producer_id=$1",
      [producer.id],
    );
    for (const a of value.areas)
      await client.query(
        "INSERT INTO jdatna.producer_coverage(producer_id,node_id,fee) VALUES($1,$2,$3)",
        [producer.id, a.nodeId, a.fee ?? null],
      );
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
      `SELECT 'legacy:'||d.city_id AS "nodeId",c.name||' (تغطية التوصيل السابقة)' AS label,d.fee::float8 AS fee FROM jdatna.delivery_areas d JOIN jdatna.cities c ON c.id=d.city_id JOIN jdatna.producer_profiles p ON p.id=d.producer_id WHERE p.id=$1 AND p.status='approved' AND NOT EXISTS(SELECT 1 FROM jdatna.producer_coverage pc WHERE pc.producer_id=p.id AND pc.node_id='city:'||d.city_id)`,
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
