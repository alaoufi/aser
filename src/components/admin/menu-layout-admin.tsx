"use client";
import { useEffect, useState } from "react";
import { api, s as forms, useSession } from "@/components/forms/shared";
import { SectionIcon } from "@/components/forms/section-icon";
import {
  LOCKED,
  NAV_GROUPS,
  applyMenuLayout,
  groupTitle,
  toLayout,
  type LaidGroup,
  type MenuLayout,
} from "@/lib/admin-nav";
import { loadMenuLayout, setMenuLayoutCache } from "./menu-layout-store";
import css from "./menu-layout-admin.module.css";

/**
 * «ترتيب القوائم» (من «أي خدمة»، AYK-410 وAYK-417): الإدارة ترتّب قائمتها بنفسها.
 * المجموعات والصفحات بالسهمين ▲▼ (بلا سحب وإفلات)، ونقل صفحة لمجموعة أخرى، وتغيير اسم المجموعة،
 * وإضافة مجموعة، وإخفاء صفحة. بعد الحفظ تتغير القائمة الجانبية فورًا لكل أعضاء الإدارة، بلا نشر.
 */
const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export function MenuLayoutAdmin() {
  const session = useSession();
  const owner = session.user?.role === "admin";
  const [groups, setGroups] = useState<LaidGroup[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const start = (layout: MenuLayout | null) => {
    // المخفية تظهر هنا باهتة، لتُظهر من جديد.
    setGroups(applyMenuLayout(NAV_GROUPS, layout, { keepHidden: true }));
    setHidden(new Set(layout?.hidden ?? []));
    setDirty(false);
  };
  useEffect(() => {
    if (owner) loadMenuLayout(true).then(start);
  }, [owner]);

  if (!session.ready) return <p role="status">جارٍ التحميل…</p>;
  if (!owner)
    return (
      <p role="alert" className={forms.error}>
        ترتيب القوائم للمدير الكامل فقط.
      </p>
    );
  if (!groups) return <p role="status">جارٍ تحميل الترتيب…</p>;

  const change = (fn: (gs: LaidGroup[]) => LaidGroup[]) => {
    setGroups((gs) => (gs ? fn(gs) : gs));
    setDirty(true);
    setMsg(null);
  };
  const moveGroup = (i: number, d: number) =>
    change((gs) => (i + d < 0 || i + d >= gs.length ? gs : move(gs, i, i + d)));
  const moveItem = (gi: number, ii: number, d: number) =>
    change((gs) =>
      gs.map((g, k) =>
        k !== gi || ii + d < 0 || ii + d >= g.items.length
          ? g
          : { ...g, items: move(g.items, ii, ii + d) },
      ),
    );
  const sendTo = (gi: number, ii: number, target: string) =>
    change((gs) => {
      const item = gs[gi].items[ii];
      return gs.map((g, k) =>
        k === gi
          ? { ...g, items: g.items.filter((_, j) => j !== ii) }
          : g.key === target
            ? { ...g, items: [...g.items, item] }
            : g,
      );
    });
  const rename = (gi: number, title: string) =>
    change((gs) => gs.map((g, k) => (k === gi ? { ...g, title } : g)));
  const addGroup = () =>
    change((gs) => [
      ...gs,
      {
        key: `custom-${Date.now()}`,
        label: null,
        title: "مجموعة جديدة",
        items: [],
      },
    ]);
  const toggleHidden = (to: string) => {
    if (LOCKED.has(to)) return;
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(to)) n.delete(to);
      else n.add(to);
      return n;
    });
    setDirty(true);
    setMsg(null);
  };
  // نصائح قواعد القوائم (المكتبة المشتركة، code/menus): من 2 إلى 7 صفحات في المجموعة.
  const advice = groups
    .flatMap((g) => {
      const shown = g.items.filter((it) => !hidden.has(it.to)).length;
      const name = groupTitle(g) || "بلا اسم";
      if (shown === 0) return [`«${name}» فارغة، وستُحذف عند الحفظ.`];
      if (shown === 1)
        return [`«${name}» فيها صفحة واحدة: الأفضل ضمّها لمجموعة قريبة.`];
      if (shown > 7) return [`«${name}» فيها ${shown} صفحات: الأفضل تقسيمها.`];
      return [];
    })
    .concat(
      groups.some((g) => !groupTitle(g).trim())
        ? ["مجموعة بلا اسم: اكتب اسمها."]
        : [],
    );

  async function save() {
    if (!groups) return;
    if (groups.some((g) => g.items.length && !groupTitle(g).trim())) {
      setMsg({ bad: true, text: "لم يُحفظ: اكتب اسم كل مجموعة." });
      return;
    }
    if (!window.confirm("حفظ الترتيب؟ تتغير القائمة لكل أعضاء الإدارة الآن."))
      return;
    setSaving(true);
    try {
      const body = toLayout(
        groups.filter((g) => g.items.length),
        hidden,
      );
      const d = await api<{ layout: MenuLayout | null }>(
        "/api/admin/menu-layout",
        { method: "PUT", body: JSON.stringify(body) },
      );
      setMenuLayoutCache(d.layout);
      start(d.layout);
      setMsg({
        text: "✓ تم الحفظ. القائمة الجانبية تغيّرت الآن لكل أعضاء الإدارة.",
      });
    } catch (e) {
      setMsg({ bad: true, text: `لم يُحفظ: ${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (!window.confirm("استعادة الترتيب الأصلي للقائمة؟")) return;
    try {
      await api("/api/admin/menu-layout", {
        method: "PUT",
        body: JSON.stringify({ reset: true }),
      });
      setMenuLayoutCache(null);
      start(null);
      setMsg({ text: "✓ رجع الترتيب الأصلي." });
    } catch (e) {
      setMsg({ bad: true, text: (e as Error).message });
    }
  }

  return (
    <section className={css.page} aria-labelledby="menu-layout-title">
      <h1 id="menu-layout-title" className="sr-only">
        ترتيب القوائم
      </h1>
      <p className={css.help}>
        غيّر مكان المجموعة أو الصفحة بالسهمين ▲▼. انقل الصفحة لمجموعة أخرى من
        «نقل إلى…»، وغيّر اسم المجموعة بالكتابة فيه، وأخفِ صفحة بزر العين. بعد
        «حفظ الترتيب» تتغير القائمة الجانبية فورًا لكل أعضاء الإدارة. الصفحات
        التي تُضاف للموقع لاحقًا تظهر وحدها في مجموعتها.
      </p>
      {msg && (
        <p
          role="status"
          className={msg.bad ? forms.error : forms.notice}
          data-testid="menu-layout-msg"
        >
          {msg.text}
        </p>
      )}
      {advice.length > 0 && (
        <ul className={css.advice} aria-label="نصائح الترتيب">
          {advice.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      {groups.map((g, gi) => (
        <section
          key={g.key}
          className={css.group}
          aria-label={`مجموعة ${groupTitle(g) || "بلا اسم"}`}
        >
          <div className={css.groupHead}>
            <input
              className={css.groupTitle}
              value={g.title ?? g.label ?? ""}
              onChange={(e) => rename(gi, e.target.value)}
              aria-label="اسم المجموعة"
            />
            <button
              type="button"
              className={css.arrow}
              onClick={() => moveGroup(gi, -1)}
              disabled={gi === 0}
              aria-label={`المجموعة ${groupTitle(g)} للأعلى`}
            >
              ▲
            </button>
            <button
              type="button"
              className={css.arrow}
              onClick={() => moveGroup(gi, 1)}
              disabled={gi === groups.length - 1}
              aria-label={`المجموعة ${groupTitle(g)} للأسفل`}
            >
              ▼
            </button>
          </div>
          {g.items.length === 0 && (
            <p className={css.empty}>
              لا صفحات. انقل إليها صفحة من مجموعة أخرى.
            </p>
          )}
          {g.items.map((it, ii) => {
            const off = hidden.has(it.to);
            return (
              <div
                key={it.to}
                className={`${css.item} ${off ? css.itemOff : ""}`}
                data-testid="menu-item"
              >
                <span className={css.itemName}>
                  <SectionIcon name={it.icon} />
                  {it.labelKey}
                  {off && " (مخفية)"}
                </span>
                <span className={css.itemTools}>
                  <button
                    type="button"
                    className={css.arrow}
                    onClick={() => moveItem(gi, ii, -1)}
                    disabled={ii === 0}
                    aria-label={`${it.labelKey} للأعلى`}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={css.arrow}
                    onClick={() => moveItem(gi, ii, 1)}
                    disabled={ii === g.items.length - 1}
                    aria-label={`${it.labelKey} للأسفل`}
                  >
                    ▼
                  </button>
                  <select
                    className={css.moveTo}
                    value=""
                    onChange={(e) =>
                      e.target.value && sendTo(gi, ii, e.target.value)
                    }
                    aria-label={`نقل ${it.labelKey} إلى`}
                  >
                    <option value="">نقل إلى…</option>
                    {groups
                      .filter((_, k) => k !== gi)
                      .map((o) => (
                        <option key={o.key} value={o.key}>
                          {groupTitle(o) || "بلا اسم"}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className={css.arrow}
                    onClick={() => toggleHidden(it.to)}
                    disabled={LOCKED.has(it.to)}
                    aria-pressed={off}
                    aria-label={`${off ? "إظهار" : "إخفاء"} ${it.labelKey}`}
                    title={
                      LOCKED.has(it.to) ? "لا تُخفى" : off ? "إظهار" : "إخفاء"
                    }
                  >
                    <EyeIcon off={off} />
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      ))}
      <div className={css.bar}>
        <button
          type="button"
          className={forms.buttonSecondary}
          onClick={addGroup}
        >
          ＋ مجموعة جديدة
        </button>
        <button
          type="button"
          className={forms.button}
          onClick={save}
          disabled={saving || !dirty}
        >
          {saving ? "جارٍ الحفظ…" : dirty ? "حفظ الترتيب" : "لا تغييرات"}
        </button>
        <button type="button" className={forms.buttonSecondary} onClick={reset}>
          ↩ استعادة الترتيب الأصلي
        </button>
      </div>
    </section>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={
          off
            ? "M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.2 3.8M6.2 7.6A17 17 0 0 0 3 12s4 6 9 6a9 9 0 0 0 4.1-1"
            : "M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
