"use client";
import { useEffect } from "react";
import { chime } from "@/lib/chime";

/**
 * تنبيه صوتي بوصول إشعار والموقع مفتوح (قرار المالك 2026-11-27): عامل الخدمة يرسل للصفحات
 * المفتوحة رسالة مع كل إشعار، فتُصدر نغمة واهتزازًا. والموقع مغلق: صوت إشعار الجهاز نفسه.
 */
export function PushChime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "jdatna:push") chime();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
