import type { City } from "./types";
export const regionOrder = [
  "riyadh",
  "makkah",
  "madinah",
  "qassim",
  "eastern",
  "asir",
  "tabuk",
  "hail",
  "northern",
  "jazan",
  "najran",
  "baha",
  "jawf",
];
export function compareRegions(
  a: { id: string; name: string },
  b: { id: string; name: string },
) {
  const rank = (id: string) => {
    const i = regionOrder.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "ar");
}
export function regionOptions(cities: City[]): [string, string][] {
  return Array.from(
    new Map(cities.map((c) => [c.regionId, c.regionName])),
  ).sort((a, b) =>
    compareRegions({ id: a[0], name: a[1] }, { id: b[0], name: b[1] }),
  );
}
