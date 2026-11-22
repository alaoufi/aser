import Link from "next/link";
import type { MemberScope, MineKey } from "@/server/member-scope";

/**
 * مفاتيح العضو أعلى الصفحة: «مشابه لمنتجاتي/لطلباتي» و«منطقتي» و«حسب تغطيتي».
 * كل خيار مربع اختيار مستقل؛ بلا أي اختيار يُعرض الكل (لا زر «الكل»، بطلب المالك).
 * كل مفتاح رابط يفعّله أو يوقفه، وبقية معاملات الصفحة تبقى كما هي.
 */
export function MineBar({
  scope,
  path,
  query = {},
  inline = false,
}: {
  scope: MemberScope;
  path: string;
  query?: Record<string, string>;
  /** داخل حاوية الصفحة نفسها (بلا هامش «wrap» ثانٍ). */
  inline?: boolean;
}) {
  if (!scope.kind || !scope.options.length) return null;
  const href = (keys: MineKey[]) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(
        ([k, v]) => v && k !== "mine" && k !== "page",
      ),
    );
    if (keys.length) params.set("mine", keys.join(","));
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };
  const toggle = (key: MineKey) =>
    scope.active.includes(key)
      ? scope.active.filter((k) => k !== key)
      : [...scope.active, key];
  return (
    <nav className={inline ? "mine-bar" : "mine-bar wrap"} aria-label="اعرض لي">
      <div className="mine-panel">
        <span className="mine-title" aria-hidden="true">
          اعرض لي
        </span>
        <div className="mine-segments">
          {scope.options.map((o) => {
            const on = scope.active.includes(o.key);
            return (
              <Link
                key={o.key}
                href={href(toggle(o.key))}
                className="mine-seg"
                role="checkbox"
                aria-checked={on}
                scroll={false}
              >
                <span className="mine-box" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                {o.label}
              </Link>
            );
          })}
        </div>
      </div>
      {scope.summary && (
        <p className="mine-note" role="status">
          {scope.summary}
        </p>
      )}
    </nav>
  );
}
