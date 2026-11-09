"use client";
import { useRouter } from "next/navigation";

/** اختيار منطقة «مائدة اليوم»: يُحفظ في الجهاز ويُعاد عرض المائدة لها. */
export function RegionPicker({
  regions,
  value,
  path,
}: {
  regions: { id: string; name: string }[];
  value: string;
  path: string;
}) {
  const router = useRouter();
  return (
    <label className="table-region">
      <span className="sr-only">منطقة المائدة</span>
      <select
        aria-label="منطقة المائدة"
        value={value}
        onChange={(e) => {
          const region = e.target.value;
          document.cookie = `jdatna_region=${encodeURIComponent(region)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
          router.push(
            region ? `${path}?region=${encodeURIComponent(region)}` : path,
          );
          router.refresh();
        }}
      >
        <option value="">كل المناطق</option>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
