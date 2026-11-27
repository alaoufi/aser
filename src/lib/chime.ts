"use client";

/** آخر نغمة: تنبيهان لنفس الحدث (رسالة وإشعارها) لا يتكرر صوتهما خلال ٤ ثوانٍ. */
let lastAt = 0;

/**
 * نغمة تنبيه قصيرة واهتزاز (قرار المالك 2026-11-27: «مع الإشعار تنبيه صوتي بوصول إشعار»).
 * مشتركة بين تنبيه الطلب الجديد والرسالة الجديدة والإشعار الواصل والموقع مفتوح.
 * المتصفح قد يمنع الصوت قبل أي تفاعل مع الصفحة؛ عندها يبقى الاهتزاز وصوت إشعار الجهاز.
 */
export function chime(notes: number[] = [880, 1175, 880]) {
  const now = Date.now();
  if (now - lastAt < 4000) return;
  lastAt = now;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    notes.forEach((freq, i) => {
      const at = i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + at + 0.3,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.35);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // الصوت اختياري.
  }
  try {
    navigator.vibrate?.([180, 80, 180]);
  } catch {
    // الاهتزاز غير مدعوم في كل الأجهزة.
  }
}
