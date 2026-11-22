import Link from "next/link";
import type { MemberScope, MineKey } from "@/server/member-scope";

/**
 * مفاتيح العضو أعلى الصفحة: «مشابه لمنتجاتي/لطلباتي» و«منطقتي» و«حسب تغطيتي».
 * الافتراضي «الكل» بلا فلتر؛ كل مفتاح رابط يفعّله أو يوقفه، وبقية معاملات الصفحة تبقى كما هي.
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
          <Link
            href={href([])}
            className="mine-seg"
            aria-current={scope.active.length ? undefined : "true"}
            scroll={false}
          >
            الكل
          </Link>
          {scope.options.map((o) => (
            <Link
              key={o.key}
              href={href(toggle(o.key))}
              className="mine-seg"
              aria-pressed={scope.active.includes(o.key)}
              role="button"
              scroll={false}
            >
              {scope.active.includes(o.key) && (
                <span className="mine-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {o.label}
            </Link>
          ))}
        </div>
      </div>
      {scope.notes.map((n) => (
        <p key={n} className="mine-note" role="status">
          {n}
        </p>
      ))}
    </nav>
  );
}
