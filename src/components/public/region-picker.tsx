"use client";
import { T } from "@/components/site-texts";
import { useRouter } from "next/navigation";
import { setVisitRegion } from "@/lib/region-cookie";

/**
 * منطقة المائدة: كل دخول يبدأ بـ«كل المناطق» (قرار المالك 2026-11-26)، ولا تُحدَّد من موقع الزائر.
 * الاختيار اليدوي أو الرابط يبقى لهذه الزيارة فقط.
 */
export function RegionPicker({
  regions,
  value,
  path,
  query = {},
}: {
  regions: { id: string; name: string }[];
  value: string;
  path: string;
  /** معاملات الرابط الأخرى (البحث والقسم…) تبقى عند تغيير المنطقة. */
  query?: Record<string, string>;
}) {
  const router = useRouter();
  const go = (region: string) => {
    setVisitRegion(region);
    const params = new URLSearchParams(
      Object.entries(query).filter(
        ([key, v]) => v && key !== "region" && key !== "city",
      ),
    );
    if (region) params.set("region", region);
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    router.refresh();
  };
  return (
    <div className="table-region-wrap">
      <label className="table-region">
        <span className="sr-only">
          <T k="c.region.t1" />
        </span>
        <select
          aria-label="منطقة المائدة"
          value={value}
          onChange={(e) => go(e.target.value)}
        >
          <option value="">كل المناطق</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
