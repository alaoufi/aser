"use client";
import { useEffect, useState } from "react";
import { useTx } from "@/components/site-texts";
import { insideApp } from "./store-badges";
import { inviteClipText } from "@/lib/invite-clipboard";

const SIGNUP = "/login?signup=1";

/**
 * صفحة الدعوة: رقم الدعوة وزر نسخه، ثم تحويل تلقائي بعد ثانيتين لمتجر الجوال أو للتسجيل.
 * داخل تطبيق الجوال (أو بلا متجر) يُحوَّل للتسجيل في الموقع مباشرة.
 */
export function InviteLanding({
  code,
  platform,
  store,
}: {
  /** رقم الدعوة؛ بدونه صفحة رابط التطبيق العام jdtna.sa/app. */
  code?: string;
  platform: "ios" | "android" | "web";
  store: string | null;
}) {
  const { tx, txb } = useTx();
  const [target, setTarget] = useState(store ?? SIGNUP);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  // الآيفون إلى App Store مع رقم دعوة: لا تحويل تلقائي، بل زر واحد ينسخ رابط الدعوة ثم يفتح المتجر،
  // فيقرؤه التطبيق عند أول فتح ويُحسب لصاحب الدعوة (قرار المالك 2026-11-28). الآيفون لا ينسخ إلا بلمسة.
  const [iosCopy, setIosCopy] = useState(false);
  useEffect(() => {
    const to = insideApp() ? SIGNUP : (store ?? SIGNUP);
    setTarget(to);
    const copyFirst = Boolean(code) && platform === "ios" && to !== SIGNUP;
    setIosCopy(copyFirst);
    if (paused || copyFirst) return;
    const t = window.setTimeout(() => window.location.assign(to), 2500);
    return () => window.clearTimeout(t);
  }, [store, paused, code, platform]);
  const storeName =
    target === SIGNUP
      ? txb("inviteLanding.site")
      : platform === "ios"
        ? "App Store"
        : "Google Play";
  return (
    <section className="wrap invite-landing" aria-labelledby="invite-title">
      <h1 id="invite-title">
        {txb(code ? "inviteLanding.title" : "appLanding.title")}
      </h1>
      <p>{tx(code ? "inviteLanding.body" : "appLanding.body")}</p>
      {code && (
        <div className="invite-landing-code">
          <span>{txb("inviteLanding.code")}</span>
          <strong dir="ltr">{code}</strong>
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              setPaused(true);
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? txb("inviteLanding.copied") : txb("inviteLanding.copy")}
          </button>
        </div>
      )}
      {code && (
        <p className="invite-landing-hint">
          {tx(iosCopy ? "inviteLanding.iosHint" : "inviteLanding.hint")}
        </p>
      )}
      <p role="status" aria-live="polite">
        {paused || iosCopy
          ? ""
          : txb("inviteLanding.going", { place: storeName })}
      </p>
      <div className="invite-landing-actions">
        <a
          className="button"
          href={target}
          onClick={
            iosCopy && code
              ? async (e) => {
                  e.preventDefault();
                  try {
                    await navigator.clipboard.writeText(
                      inviteClipText(window.location.origin, code),
                    );
                  } catch {}
                  window.location.assign(target);
                }
              : undefined
          }
        >
          {target === SIGNUP
            ? txb("inviteLanding.signup")
            : txb("inviteLanding.download", { place: storeName })}
        </a>
        {target !== SIGNUP && (
          <a className="text-link" href={SIGNUP}>
            {txb("inviteLanding.web")}
          </a>
        )}
      </div>
    </section>
  );
}
