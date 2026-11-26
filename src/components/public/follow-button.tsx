"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useSession } from "@/components/forms/session";
import { enableDevicePush } from "@/components/public/push-setup";
import type { FollowTexts } from "@/lib/follow-texts";

/**
 * «نبّهني» (تنبيهات الأسرة، 2026-11-26): في صفحة الأسرة وصفحة المنتج. العضو يختار ما يصله (منتج جديد،
 * بداية توزيع مجدول) ونطاقه (كل منتجاتها أو منتجات محددة)، ويوافق صراحة قبل التفعيل.
 * الزائر بلا حساب: رابط الدخول. النصوص من «نصوص الموقع» (يمررها الخادم).
 */
type Follow = {
  notifyNew: boolean;
  notifySchedule: boolean;
  scope: "all" | "selected";
  productIds: string[];
  paused: boolean;
};

export function FollowButton({
  producer,
  family,
  productId,
  texts,
}: {
  producer: string;
  family: string;
  /** في صفحة المنتج: يُختار هذا المنتج عند «منتجات محددة». */
  productId?: string;
  texts: FollowTexts;
}) {
  const { user, ready } = useSession();
  const [open, setOpen] = useState(false);
  const [follow, setFollow] = useState<Follow | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [notifyNew, setNotifyNew] = useState(true);
  const [notifySchedule, setNotifySchedule] = useState(true);
  const [scope, setScope] = useState<"all" | "selected">(
    productId ? "selected" : "all",
  );
  const [chosen, setChosen] = useState<string[]>(productId ? [productId] : []);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    const d = await api<{
      follow: Follow | null;
      products: { id: string; name: string }[];
    }>(`/api/alerts/follows?producer=${encodeURIComponent(producer)}`);
    setFollow(d.follow);
    setProducts(d.products);
    if (d.follow) {
      setNotifyNew(d.follow.notifyNew);
      setNotifySchedule(d.follow.notifySchedule);
      setScope(d.follow.scope);
      setChosen(d.follow.productIds);
    }
  };
  useEffect(() => {
    if (user) load().catch(() => {});
    // يُحمَّل عند معرفة الحساب فقط.
  }, [user?.id]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (ready && !user)
    return (
      <Link
        className="button secondary follow-button"
        href={`/login?next=${encodeURIComponent(
          productId ? `/products/${productId}` : `/producers/${producer}`,
        )}`}
      >
        <span aria-hidden="true">🔔</span> {texts.login}
      </Link>
    );

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/alerts/follows", {
        method: "PUT",
        body: JSON.stringify({
          producer,
          notifyNew,
          notifySchedule,
          scope,
          productIds: scope === "selected" ? chosen : [],
          consent: true,
        }),
        saved: false,
      });
      // إشعار الجهاز من الضغطة نفسها؛ إن رفضه الزائر تبقى التنبيهات في «تنبيهاتي».
      void enableDevicePush();
      await load();
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    setBusy(true);
    try {
      await api("/api/alerts/follows", {
        method: "PATCH",
        body: JSON.stringify({ producer, action: "cancel" }),
        saved: false,
      });
      setFollow(null);
      setConsent(false);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const valid =
    consent &&
    (notifyNew || notifySchedule) &&
    (scope === "all" || chosen.length > 0);
  return (
    <div className="follow" ref={box}>
      <button
        type="button"
        className={`button ${follow ? "light" : "secondary"} follow-button`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🔔</span>{" "}
        {follow && !follow.paused ? texts.following : texts.button}
      </button>
      {open && (
        <div
          className="follow-panel"
          role="dialog"
          aria-label={texts.title.replace("{family}", family)}
        >
          <strong>{texts.title.replace("{family}", family)}</strong>
          <p>{texts.intro}</p>
          <label>
            <input
              type="checkbox"
              checked={notifyNew}
              onChange={(e) => setNotifyNew(e.target.checked)}
            />{" "}
            {texts.optNew}
          </label>
          <label>
            <input
              type="checkbox"
              checked={notifySchedule}
              onChange={(e) => setNotifySchedule(e.target.checked)}
            />{" "}
            {texts.optSchedule}
          </label>
          <fieldset>
            <legend className="sr-only">{texts.scopeAll}</legend>
            <label>
              <input
                type="radio"
                name={`scope-${producer}`}
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />{" "}
              {texts.scopeAll}
            </label>
            <label>
              <input
                type="radio"
                name={`scope-${producer}`}
                checked={scope === "selected"}
                onChange={() => setScope("selected")}
              />{" "}
              {texts.scopeSelected}
            </label>
          </fieldset>
          {scope === "selected" && (
            <div className="follow-products">
              {products.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(p.id)}
                    onChange={(e) =>
                      setChosen((c) =>
                        e.target.checked
                          ? [...c, p.id]
                          : c.filter((x) => x !== p.id),
                      )
                    }
                  />{" "}
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <label className="follow-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            {texts.consent}
          </label>
          {error && (
            <p role="alert" className="follow-error">
              {error}
            </p>
          )}
          <div className="follow-actions">
            <button
              type="button"
              className="button small"
              disabled={!valid || busy}
              onClick={save}
            >
              {follow ? texts.update : texts.save}
            </button>
            {follow && (
              <button
                type="button"
                className="button small light"
                disabled={busy}
                onClick={stop}
              >
                {texts.stop}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
