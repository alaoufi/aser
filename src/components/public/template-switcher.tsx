"use client";
import { useRouter } from "next/navigation";

/** الزائر يختار شكل الموقع؛ يُحفظ في جهازه ويتقدم على اختيار الإدارة الافتراضي. */
export function TemplateSwitcher({
  current,
  className,
}: {
  current: "classic" | "najdi";
  className?: string;
}) {
  const router = useRouter();
  const pick = (template: "classic" | "najdi") => {
    document.cookie = `jdatna_template=${template}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };
  return (
    <fieldset className={`template-switcher ${className ?? ""}`}>
      <legend>شكل الموقع</legend>
      {(
        [
          ["classic", "الكلاسيكي"],
          ["najdi", "الباب النجدي"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={current === id}
          onClick={() => pick(id)}
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}
