"use client";
import { useRouter } from "next/navigation";
import {
  TEMPLATE_COOKIE,
  appearanceCookie,
  type SiteTemplate,
} from "@/lib/appearance";
import { api, useSession } from "@/components/forms/session";

/** الزائر يختار شكل الموقع؛ يُحفظ في جهازه (وفي حسابه إن كان مسجلًا) ويتقدم على اختيار الإدارة الافتراضي. */
export function TemplateSwitcher({
  current,
  templates,
  labels,
  className,
}: {
  current: SiteTemplate;
  templates: SiteTemplate[];
  labels: Record<SiteTemplate, string>;
  className?: string;
}) {
  const router = useRouter();
  const { user } = useSession();
  const pick = (template: SiteTemplate) => {
    document.cookie = appearanceCookie(TEMPLATE_COOKIE, template);
    if (user)
      api("/api/me/appearance", {
        method: "PUT",
        body: JSON.stringify({ template }),
        saved: false,
      }).catch(() => {});
    router.refresh();
  };
  if (templates.length < 2) return null;
  return (
    <fieldset className={`template-switcher ${className ?? ""}`}>
      <legend>شكل الموقع</legend>
      {templates.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={current === id}
          onClick={() => pick(id)}
        >
          {labels[id]}
        </button>
      ))}
    </fieldset>
  );
}
