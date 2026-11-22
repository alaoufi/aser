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
}: {
  scope: MemberScope;
  path: string;
  query?: Record<string, string>;
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
    <nav className="mine-bar wrap" aria-label="اعرض لي">
      <Link
        href={href([])}
        className="mine-chip"
        aria-current={scope.active.length ? undefined : "true"}
        scroll={false}
      >
        الكل
      </Link>
      {scope.options.map((o) => (
        <Link
          key={o.key}
          href={href(toggle(o.key))}
          className="mine-chip"
          aria-pressed={scope.active.includes(o.key)}
          role="button"
          scroll={false}
        >
          {scope.active.includes(o.key) && <span aria-hidden="true">✓ </span>}
          {o.label}
        </Link>
      ))}
      {scope.notes.map((n) => (
        <p key={n} className="mine-note" role="status">
          {n}
        </p>
      ))}
    </nav>
  );
}
