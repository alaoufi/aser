"use client";
import type { City } from "@/lib/types";
import { s } from "./shared";
export type AdvancedProfile = {
  socialLinks?: { platform: string; url: string }[];
  businessHours?: { day: number; opens: string; closes: string }[];
  deliveryAreas?: { cityId: string; fee: number | null }[];
};
const platforms = [
  ["instagram", "إنستغرام"],
  ["tiktok", "تيك توك"],
  ["snapchat", "سناب شات"],
  ["x", "إكس"],
  ["telegram", "تيليغرام"],
  ["website", "الموقع الإلكتروني"],
];
const days = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export function AdvancedFields({
  profile,
  cities,
}: {
  profile: AdvancedProfile | null;
  cities: City[];
}) {
  return (
    <>
      <fieldset>
        <legend>روابط التواصل (اختيارية)</legend>
        <div className={s.grid}>
          {platforms.map(([id, label]) => (
            <label className={s.field} key={id}>
              {label}
              <input
                name={`social-${id}`}
                type="url"
                pattern="https://.*"
                placeholder="https://"
                dir="ltr"
                maxLength={2048}
                defaultValue={
                  profile?.socialLinks?.find((v) => v.platform === id)?.url
                }
              />
            </label>
          ))}
        </div>
        <p className={s.muted}>
          أدخل روابط HTTPS الكاملة فقط. تظهر الروابط المحفوظة في صفحة الأسرة.
        </p>
      </fieldset>
      <fieldset>
        <legend>أوقات استقبال الطلبات (اختيارية)</legend>
        <p className={s.muted}>
          اختر أيام العمل ووقت البداية والنهاية. يجب أن تكون النهاية بعد البداية
          في اليوم نفسه.
        </p>
        {days.map((day, index) => {
          const hours = profile?.businessHours?.find((v) => v.day === index);
          return (
            <div className={s.grid} key={day}>
              <label className={s.checks}>
                <input
                  type="checkbox"
                  name={`day-${index}`}
                  defaultChecked={!!hours}
                />
                {day}
              </label>
              <label className={s.field}>
                بداية {day}
                <input
                  name={`opens-${index}`}
                  type="time"
                  defaultValue={hours?.opens}
                />
              </label>
              <label className={s.field}>
                نهاية {day}
                <input
                  name={`closes-${index}`}
                  type="time"
                  defaultValue={hours?.closes}
                />
              </label>
            </div>
          );
        })}
      </fieldset>
      <fieldset>
        <legend>مدن التوصيل ورسومه (اختيارية)</legend>
        <p className={s.muted}>
          تُستخدم هذه المناطق عند تفعيل التوصيل. اترك الرسوم فارغة للاتفاق
          المباشر، أو أدخل صفرًا للتوصيل المجاني.
        </p>
        {cities.map((city) => {
          const area = profile?.deliveryAreas?.find(
            (v) => v.cityId === city.id,
          );
          return (
            <div className={s.grid} key={city.id}>
              <label className={s.checks}>
                <input
                  type="checkbox"
                  name="deliveryCities"
                  value={city.id}
                  defaultChecked={!!area}
                />
                {city.name} — {city.regionName}
              </label>
              <label className={s.field}>
                رسوم توصيل {city.name} (ر.س)
                <input
                  name={`fee-${city.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={area?.fee ?? ""}
                />
              </label>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
export function advancedPayload(f: FormData) {
  const socialLinks = platforms.flatMap(([platform]) => {
    const url = String(f.get(`social-${platform}`) || "").trim();
    if (!url) return [];
    if (!url.startsWith("https://"))
      throw new Error("روابط التواصل يجب أن تبدأ بـ https://");
    return [{ platform, url }];
  });
  const businessHours = days.flatMap((_, day) => {
    if (!f.has(`day-${day}`)) return [];
    const opens = String(f.get(`opens-${day}`) || "");
    const closes = String(f.get(`closes-${day}`) || "");
    if (!opens || !closes || opens >= closes)
      throw new Error("أدخل بداية ونهاية صحيحتين لكل يوم عمل محدد.");
    return [{ day, opens, closes }];
  });
  const deliveryAreas = f.has("delivery")
    ? f.getAll("deliveryCities").map((v) => {
        const cityId = String(v);
        const raw = String(f.get(`fee-${cityId}`) || "");
        const fee = raw === "" ? null : Number(raw);
        if (fee !== null && (!Number.isFinite(fee) || fee < 0))
          throw new Error("رسوم التوصيل يجب أن تكون صفرًا أو قيمة موجبة.");
        return { cityId, fee };
      })
    : [];
  return { socialLinks, businessHours, deliveryAreas };
}
