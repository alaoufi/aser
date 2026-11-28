"use client";
import { useEffect, useRef, useState } from "react";
import Sortable from "sortablejs";
import { api } from "@/components/forms/shared";
import { SectionIcon } from "@/components/forms/section-icon";
import { useTx } from "@/components/site-texts";
import { groupTitle, type MenuOrder } from "@/lib/admin-nav";
import css from "./admin-frame.module.css";

/**
 * ترتيب القائمة الجانبية بالسحب والإفلات لكل مدير (طلب المالك 2026-11-28، SortableJS بترخيص MIT):
 * يُحفظ في قاعدة البيانات لكل مدير ويبقى بعد التحديث، و«استعادة الترتيب الافتراضي».
 * على الجوال بالضغط المطوّل ثم السحب. للعرض فقط: لا يُظهر ما ليس من صلاحياته ولا يغيّر الصلاحيات.
 */
let cached: MenuOrder | null | undefined;
const listeners = new Set<(o: MenuOrder | null) => void>();
export function useMenuOrder(enabled = true) {
  const [order, setOrder] = useState<MenuOrder | null>(cached ?? null);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setOrder);
    if (cached === undefined)
      api<{ order: MenuOrder | null }>("/api/admin/menu-layout/mine")
        .then((d) => publish(d.order ?? null))
        .catch(() => publish(null));
    return () => {
      listeners.delete(setOrder);
    };
  }, [enabled]);
  return order;
}
function publish(order: MenuOrder | null) {
  cached = order;
  for (const fn of listeners) fn(order);
}

type Group = {
  key: string;
  title: string | null;
  label: string | null;
  items: { to: string; icon: string; labelKey: string }[];
};
const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

export function MenuOrderEditor({
  groups,
  onDone,
}: {
  groups: Group[];
  onDone: () => void;
}) {
  const { tx } = useTx();
  const [draft, setDraft] = useState(groups);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useRef<HTMLDivElement>(null);
  // SortableJS يحرّك العناصر في الصفحة؛ نعيدها مكانها ونترك React يرسم الترتيب الجديد.
  const undoDom = (e: Sortable.SortableEvent) => {
    const { from, item, oldIndex } = e;
    from.removeChild(item);
    from.insertBefore(item, from.children[oldIndex ?? 0] ?? null);
  };
  useEffect(() => {
    const root = nav.current;
    if (!root) return;
    const common = {
      animation: 150,
      delay: 300,
      delayOnTouchOnly: true,
      ghostClass: css.dragGhost,
      chosenClass: css.dragChosen,
    };
    const sortables = [
      Sortable.create(root, {
        ...common,
        handle: "[data-group-handle]",
        draggable: "[data-group-key]",
        onEnd: (e) => {
          undoDom(e);
          if (e.oldIndex == null || e.newIndex == null) return;
          setDraft((d) => move(d, e.oldIndex!, e.newIndex!));
        },
      }),
      ...[...root.querySelectorAll<HTMLElement>("[data-items]")].map((list) =>
        Sortable.create(list, {
          ...common,
          // الصفحة تبقى في مجموعتها.
          group: list.dataset.items,
          onEnd: (e) => {
            undoDom(e);
            if (e.oldIndex == null || e.newIndex == null) return;
            const key = list.dataset.items;
            setDraft((d) =>
              d.map((g) =>
                g.key === key
                  ? { ...g, items: move(g.items, e.oldIndex!, e.newIndex!) }
                  : g,
              ),
            );
          },
        }),
      ),
    ];
    return () => {
      for (const s of sortables) s.destroy();
    };
  }, []);
  async function save(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ order: MenuOrder | null }>(
        "/api/admin/menu-layout/mine",
        { method: "PUT", body: JSON.stringify(body) },
      );
      publish(d.order ?? null);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={css.orderEditor}>
      <p className={css.orderHint}>{tx("menuOrder.hint")}</p>
      <div ref={nav} className={css.nav} data-testid="menu-order">
        {draft.map((g) => (
          <div key={g.key} data-group-key={g.key} className={css.orderGroup}>
            <p className={css.groupTitle} data-group-handle>
              <span aria-hidden="true" className={css.dragHandle}>
                ⠿
              </span>
              {groupTitle(g)}
            </p>
            <ul data-items={g.key} className={css.orderList}>
              {g.items.map((it) => (
                <li key={it.to} data-to={it.to} className={css.item}>
                  <span aria-hidden="true" className={css.dragHandle}>
                    ⠿
                  </span>
                  <SectionIcon name={it.icon} />
                  <span>{it.labelKey}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className={css.orderError}>
          {error}
        </p>
      )}
      <div className={css.orderActions}>
        <button
          type="button"
          className={css.orderSave}
          disabled={busy}
          onClick={() =>
            save({
              groups: draft.map((g) => g.key),
              items: Object.fromEntries(
                draft.map((g) => [g.key, g.items.map((it) => it.to)]),
              ),
            })
          }
        >
          {tx("menuOrder.save")}
        </button>
        <button
          type="button"
          className={css.orderCancel}
          disabled={busy}
          onClick={onDone}
        >
          {tx("menuOrder.cancel")}
        </button>
        <button
          type="button"
          className={css.orderReset}
          disabled={busy}
          onClick={() => {
            if (window.confirm(tx("menuOrder.resetConfirm")))
              void save({ reset: true });
          }}
        >
          {tx("menuOrder.reset")}
        </button>
      </div>
    </div>
  );
}
