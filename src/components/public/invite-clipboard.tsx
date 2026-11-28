"use client";
import { useEffect } from "react";
import { useSession } from "@/components/forms/session";
import { parseInviteClip } from "@/lib/invite-clipboard";

const CHECKED = "jdatna:invite-clipboard-checked";

type NativeClipboard = { read(): Promise<{ value?: string }> };
function nativeClipboard(): NativeClipboard | null {
  const cap = (
    window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
        Plugins?: { Clipboard?: NativeClipboard };
      };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.() || cap.getPlatform?.() !== "ios") return null;
  return cap.Plugins?.Clipboard ?? null;
}

/**
 * تطبيق الآيفون: أول فتح قبل تسجيل الدخول يقرأ رابط الدعوة من الحافظة (نسخته صفحة الدعوة)،
 * فيُحفظ رقم الدعوة كما يحفظه رابط الدعوة في المتصفح، ويُفتح «حساب جديد».
 * مرة واحدة فقط لكل تثبيت، ولا يقرأ لمن سجّل دخوله، ولا يعمل في نسخ التطبيق القديمة (بلا الإضافة).
 */
export function InviteClipboard() {
  const session = useSession();
  useEffect(() => {
    if (!session.ready || session.user || session.error) return;
    const clip = nativeClipboard();
    if (!clip) return;
    try {
      if (localStorage.getItem(CHECKED)) return;
      localStorage.setItem(CHECKED, "1");
    } catch {
      return;
    }
    if (/(?:^|;\s*)jdatna_ref=/.test(document.cookie)) return;
    clip
      .read()
      .then(({ value }) => {
        const code = parseInviteClip(value);
        if (!code) return;
        document.cookie = `jdatna_ref=${code}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
        if (window.location.pathname === "/")
          window.location.assign("/login?signup=1");
      })
      .catch(() => {});
  }, [session.ready, session.user, session.error]);
  return null;
}
