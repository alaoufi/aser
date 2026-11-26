"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  PALETTES,
  PALETTE_COOKIE,
  TEMPLATE_COOKIE,
  appearanceCookie,
  isPalette,
  isTemplate,
  type PaletteKey,
  type SiteTemplate,
} from "@/lib/appearance";
import { api, useSession } from "@/components/forms/session";

/**
 * «المظهر» (طلبا المالك 2026-11-25 و2026-11-26): الزائر يختار القالب واللون من الترويسة أو التذييل.
 * اللون يتغير فورًا (سمة data-palette)، والقالب يُعاد رسمه من الخادم. الاختيار في cookie يقرؤه الخادم
 * فلا وميض، وفي حساب العضو المسجّل فيتبعه في أجهزته. «السدو» والكلاسيكي هما الأصل.
 */
export { PALETTES };

export type AppearanceTexts = {
  button: string;
  title: string;
  templates: string;
  colors: string;
  note: string;
  template: Record<SiteTemplate, string>;
  palette: Record<PaletteKey, string>;
};

const swatch = (p: (typeof PALETTES)[number]) =>
  `linear-gradient(135deg, ${p.from} 0 50%, ${p.to} 50% 100%)`;

const hasCookie = (name: string) =>
  new RegExp(`(^|; )${name}=`).test(document.cookie);

/** مزامنة الحساب مرة واحدة لكل تحميل صفحة (الزر في الترويسة والتذييل معًا). */
let accountChecked = false;

function applyPalette(key: PaletteKey) {
  const d = document.documentElement;
  if (key === "sadu") delete d.dataset.palette;
  else d.dataset.palette = key;
  d.dataset.paletteChosen = "1";
}

export function AppearancePicker({
  texts,
  template,
  templates,
  palettes,
  place = "header",
}: {
  texts: AppearanceTexts;
  template: SiteTemplate;
  templates: SiteTemplate[];
  palettes: PaletteKey[];
  place?: "header" | "footer";
}) {
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteKey>("sadu");
  const box = useRef<HTMLDivElement>(null);
  // اللون الحالي من الصفحة نفسها (قد يغيّره الزر الآخر في الترويسة أو التذييل).
  useEffect(() => {
    const p = document.documentElement.dataset.palette;
    setPalette(isPalette(p) ? p : "sadu");
  }, [open]);
  // عضو يدخل من جهاز لم يختر فيه بعد: يُطبَّق مظهر حسابه ويُحفظ في الجهاز.
  useEffect(() => {
    if (!user || accountChecked) return;
    accountChecked = true;
    if (hasCookie(PALETTE_COOKIE) && hasCookie(TEMPLATE_COOKIE)) return;
    api<{ template?: string | null; palette?: string | null }>(
      "/api/me/appearance",
    )
      .then((saved) => {
        if (
          !hasCookie(PALETTE_COOKIE) &&
          isPalette(saved.palette) &&
          palettes.includes(saved.palette)
        ) {
          document.cookie = appearanceCookie(PALETTE_COOKIE, saved.palette);
          applyPalette(saved.palette);
          setPalette(saved.palette);
        }
        if (
          !hasCookie(TEMPLATE_COOKIE) &&
          isTemplate(saved.template) &&
          templates.includes(saved.template)
        ) {
          document.cookie = appearanceCookie(TEMPLATE_COOKIE, saved.template);
          if (saved.template !== template) router.refresh();
        }
      })
      .catch(() => {});
  }, [user, palettes, templates, template, router]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const remember = (body: {
    template?: SiteTemplate;
    palette?: PaletteKey;
  }) => {
    if (user)
      api("/api/me/appearance", {
        method: "PUT",
        body: JSON.stringify(body),
        saved: false,
      }).catch(() => {});
  };
  function choosePalette(key: PaletteKey) {
    setPalette(key);
    applyPalette(key);
    document.cookie = appearanceCookie(PALETTE_COOKIE, key);
    remember({ palette: key });
  }
  function chooseTemplate(key: SiteTemplate) {
    document.cookie = appearanceCookie(TEMPLATE_COOKIE, key);
    remember({ template: key });
    if (key !== template) router.refresh();
  }
  const now = PALETTES.find((p) => p.key === palette) ?? PALETTES[0];
  const shown = PALETTES.filter((p) => palettes.includes(p.key));
  return (
    <div className={`appearance appearance-${place}`} ref={box}>
      <button
        type="button"
        className="appearance-button"
        aria-label={texts.button}
        title={texts.button}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="appearance-dot" style={{ background: swatch(now) }} />
        {place === "footer" && (
          <span className="appearance-label">{texts.button}</span>
        )}
      </button>
      {open && (
        <div
          className="appearance-panel"
          role="dialog"
          aria-label={texts.title}
        >
          <strong className="appearance-title">{texts.title}</strong>
          {templates.length > 1 && (
            <>
              <span className="appearance-subtitle">{texts.templates}</span>
              <div className="appearance-templates">
                {templates.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`appearance-template look-${t}`}
                    aria-pressed={template === t}
                    onClick={() => chooseTemplate(t)}
                  >
                    <span
                      className="appearance-template-mark"
                      aria-hidden="true"
                    />
                    <span>{texts.template[t]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {shown.length > 1 && (
            <>
              <span className="appearance-subtitle">{texts.colors}</span>
              <div className="appearance-swatches">
                {shown.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="appearance-swatch"
                    aria-pressed={palette === p.key}
                    onClick={() => choosePalette(p.key)}
                  >
                    <span
                      className="appearance-dot"
                      style={{ background: swatch(p) }}
                    />
                    <span>{texts.palette[p.key]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {texts.note && (
            <small className="appearance-note">{texts.note}</small>
          )}
        </div>
      )}
    </div>
  );
}
