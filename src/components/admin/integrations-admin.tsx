"use client";
import { useEffect, useState } from "react";
import { api, s as forms } from "@/components/forms/shared";
import css from "./activity-admin.module.css";

/** «تكاملات API»: الخدمات المربوطة بالموقع وحالتها، بلا أي مفتاح. */
type Item = {
  id: string;
  label: string;
  what: string;
  ok: boolean;
  note: string;
};

export function IntegrationsAdmin() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ items: Item[] }>("/api/admin/integrations")
      .then((d) => setItems(d.items))
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <section className={css.page} aria-labelledby="integrations-title">
      <h1 id="integrations-title" className="sr-only">
        تكاملات API
      </h1>
      <p className={css.help}>
        الخدمات الخارجية المربوطة بالموقع: مربوطة أو لا فقط. مفاتيحها محفوظة على
        الخادم وحده ولا تظهر هنا ولا في أي مكان في الموقع. لتغيير خدمة أو
        مفتاحها اطلبه من جلسة المطوّر.
      </p>
      {error && (
        <p role="alert" className={forms.error}>
          {error}
        </p>
      )}
      {!items && !error && <p role="status">جارٍ التحميل…</p>}
      {items && (
        <ul className={css.list} aria-label="الخدمات">
          {items.map((it) => (
            <li key={it.id} className={css.row}>
              <div className={css.head}>
                <strong>{it.label}</strong>
                <span className={it.ok ? css.on : css.off}>
                  {it.ok ? "مربوطة ✓" : "غير مربوطة"}
                </span>
              </div>
              <p className={css.who}>{it.what}</p>
              {!it.ok && <p className={css.note}>{it.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
