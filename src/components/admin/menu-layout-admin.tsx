"use client";
import { useEffect, useRef, useState } from "react";
import Sortable from "sortablejs";
import { useTx } from "@/components/site-texts";
import { api, s as forms, useSession } from "@/components/forms/shared";
import { SectionIcon } from "@/components/forms/section-icon";
import { can } from "@/lib/permissions";
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
 * المجموعات والصفحات بالسحب والإفلات (قرار المالك 2026-11-28: لا أسهم ▲▼؛ SortableJS)، ونقل صفحة لمجموعة أخرى، وتغيير اسم المجموعة،
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
  const owner = can(session.user, "menu-layout");
  const [groups, setGroups] = useState<LaidGroup[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { tx } = useTx();
  const board = useRef<HTMLDivElement>(null);
  // السحب والإفلات (SortableJS): المجموعة من مقبضها، والصفحة داخل مجموعتها أو إلى مجموعة أخرى.
  // على الجوال ضغطة مطوّلة ثم سحب. SortableJS يحرّك العناصر؛ نعيدها مكانها ويرسم React الترتيب.
  const shape = groups?.map((g) => `${g.key}:${g.items.length}`).join("|");
  useEffect(() => {
    const root = board.current;
    if (!root || !shape) return;
    const undo = (e: Sortable.SortableEvent) => {
      e.to.removeChild(e.item);
      e.from.insertBefore(e.item, e.from.children[e.oldIndex ?? 0] ?? null);
    };
    const common = {
      animation: 150,
      delay: 300,
      delayOnTouchOnly: true,
      ghostClass: css.dragGhost,
    };
    const list = [
      Sortable.create(root, {
        ...common,
        handle: "[data-group-handle]",
        draggable: "[data-group]",
        onEnd: (e) => {
          undo(e);
          if (e.oldIndex == null || e.newIndex == null) return;
          if (e.oldIndex !== e.newIndex)
            change((gs) => move(gs, e.oldIndex!, e.newIndex!));
        },
      }),
      ...[...root.querySelectorAll<HTMLElement>("[data-items]")].map((el) =>
        Sortable.create(el, {
          ...common,
          group: "menu-items",
          draggable: "[data-testid=menu-item]",
          handle: "[data-item-handle]",
          onEnd: (e) => {
            undo(e);
            const from = Number((e.from as HTMLElement).dataset.items);
            const to = Number((e.to as HTMLElement).dataset.items);
            const oi = e.oldDraggableIndex ?? e.oldIndex;
            const ni = e.newDraggableIndex ?? e.newIndex;
            if (oi == null || ni == null || (from === to && oi === ni)) return;
            change((gs) => {
              const item = gs[from].items[oi];
              const next = gs.map((g) => ({ ...g, items: [...g.items] }));
              next[from].items.splice(oi, 1);
              next[to].items.splice(ni, 0, item);
              return next;
            });
          },
        }),
      ),
    ];
    return () => {
      for (const s of list) s.destroy();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: يُعاد عند تغيّر شكل المجموعات فقط
  }, [shape]);

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
        ترتيب القوائم ليس ضمن أقسامك في الإدارة.
      </p>
    );
  if (!groups) return <p role="status">جارٍ تحميل الترتيب…</p>;

  const change = (fn: (gs: LaidGroup[]) => LaidGroup[]) => {
    setGroups((gs) => (gs ? fn(gs) : gs));
    setDirty(true);
    setMsg(null);
  };
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
      <p className={css.help}>{tx("menuLayout.help")}</p>
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
      <div ref={board} className={css.board}>
        {groups.map((g, gi) => (
          <section
            key={g.key}
            className={css.group}
            data-group={gi}
            aria-label={`مجموعة ${groupTitle(g) || "بلا اسم"}`}
          >
            <div className={css.groupHead}>
              <span
                className={css.handle}
                data-group-handle
                title={tx("menuLayout.drag")}
                aria-hidden="true"
              >
                ⠿
              </span>
              <input
                className={css.groupTitle}
                value={g.title ?? g.label ?? ""}
                onChange={(e) => rename(gi, e.target.value)}
                aria-label="اسم المجموعة"
              />
            </div>
            {g.items.length === 0 && (
              <p className={css.empty}>
                لا صفحات. انقل إليها صفحة من مجموعة أخرى.
              </p>
            )}
            <div data-items={gi} className={css.items}>
              {g.items.map((it, ii) => {
                const off = hidden.has(it.to);
                return (
                  <div
                    key={it.to}
                    className={`${css.item} ${off ? css.itemOff : ""}`}
                    data-testid="menu-item"
                  >
                    <span className={css.itemName}>
                      <span
                        className={css.handle}
                        data-item-handle
                        title={tx("menuLayout.drag")}
                        aria-hidden="true"
                      >
                        ⠿
                      </span>
                      <SectionIcon name={it.icon} />
                      {it.labelKey}
                      {off && " (مخفية)"}
                    </span>
                    <span className={css.itemTools}>
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
                          LOCKED.has(it.to)
                            ? "لا تُخفى"
                            : off
                              ? "إظهار"
                              : "إخفاء"
                        }
                      >
                        <EyeIcon off={off} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
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
