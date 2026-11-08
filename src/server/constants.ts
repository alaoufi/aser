import { createHash } from "node:crypto";
import { locationNames } from "./location-names";
import type { Category, City } from "../lib/types";
export const categories: Category[] = [
  "الأكلات الشعبية والتراثية",
  "الأرز والولائم",
  "الجريش والقرصان والمرقوق",
  "المخبوزات والمعجنات",
  "الحلويات الشعبية",
  "التمور ومشتقاتها",
  "السمن والعسل والمنتجات البلدية",
  "المخللات والمربيات",
  "البهارات والخلطات المنزلية",
  "القهوة ومستلزماتها",
  "الأكلات الموسمية",
  "المنتجات الغذائية الأخرى المسموح بها",
  "منتجات الألبان",
  "المشروبات",
].map((name, i) => ({
  id: String(i + 1),
  name,
  slug: `category-${i + 1}`,
  icon: [
    "🍲",
    "🍚",
    "🥣",
    "🥖",
    "🍯",
    "🌴",
    "🍯",
    "🫙",
    "🌿",
    "☕",
    "🌙",
    "🍽️",
    "🧀",
    "🥤",
  ][i],
}));
export const categoryChildren: Category[] = [
  ["dairy-laban", "لبن", "13", "🥛"],
  ["dairy-aqt", "أقط", "13", "🧀"],
  ["dairy-ghee", "سمن", "13", "🧈"],
  ["dairy-qeshed", "قشد", "13", "🥛"],
  ["dairy-butter", "زبد", "13", "🧈"],
  ["drinks-hot", "مشروبات ساخنة", "14", "☕"],
  ["drinks-cold", "مشروبات باردة", "14", "🥤"],
].map(([id, name, parentId, icon]) => ({ id, name, parentId, icon, slug: id }));
categories.push(...categoryChildren);
const initialCities: City[] = [
  ["riyadh", "الرياض", "riyadh", "منطقة الرياض"],
  ["jeddah", "جدة", "makkah", "منطقة مكة المكرمة"],
  ["makkah", "مكة المكرمة", "makkah", "منطقة مكة المكرمة"],
  ["madinah", "المدينة المنورة", "madinah", "منطقة المدينة المنورة"],
  ["dammam", "الدمام", "eastern", "المنطقة الشرقية"],
  ["khobar", "الخبر", "eastern", "المنطقة الشرقية"],
  ["ahsa", "الأحساء", "eastern", "المنطقة الشرقية"],
  ["taif", "الطائف", "makkah", "منطقة مكة المكرمة"],
  ["abha", "أبها", "asir", "منطقة عسير"],
  ["tabuk", "تبوك", "tabuk", "منطقة تبوك"],
  ["hail", "حائل", "hail", "منطقة حائل"],
  ["buraydah", "بريدة", "qassim", "منطقة القصيم"],
  ["jazan", "جازان", "jazan", "منطقة جازان"],
  ["najran", "نجران", "najran", "منطقة نجران"],
  ["baha", "الباحة", "baha", "منطقة الباحة"],
  ["arar", "عرعر", "northern", "منطقة الحدود الشمالية"],
  ["sakaka", "سكاكا", "jawf", "منطقة الجوف"],
].map(([id, name, regionId, regionName]) => ({
  id,
  name,
  regionId,
  regionName,
}));

export const cities: City[] = Object.entries(locationNames).flatMap(
  ([regionId, names]) =>
    names.map((name) => {
      const existing = initialCities.find(
        (c) => c.regionId === regionId && c.name === name,
      );
      const region = initialCities.find((c) => c.regionId === regionId)!;
      return (
        existing ?? {
          id:
            "sa-" +
            regionId +
            "-" +
            createHash("sha256").update(name).digest("hex").slice(0, 12),
          name,
          regionId,
          regionName: region.regionName,
        }
      );
    }),
);
