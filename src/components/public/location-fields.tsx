"use client";
import { useState } from "react";
import type { City } from "@/lib/types";
export function LocationFields({
  cities,
  defaultRegion = "",
  defaultCity = "",
  required = false,
  cityName = "city",
  regionName = "region",
  className = "",
}: {
  cities: City[];
  defaultRegion?: string;
  defaultCity?: string;
  required?: boolean;
  cityName?: string;
  regionName?: string;
  className?: string;
}) {
  const regions = Array.from(
    new Map(cities.map((c) => [c.regionId, c.regionName])),
  );
  const initialRegion =
    defaultRegion || cities.find((c) => c.id === defaultCity)?.regionId || "";
  const [region, setRegion] = useState(initialRegion);
  const [city, setCity] = useState(
    cities.some((c) => c.id === defaultCity && c.regionId === initialRegion)
      ? defaultCity
      : "",
  );
  return (
    <>
      <label className={className}>
        <span>المنطقة</span>
        <select
          name={regionName}
          value={region}
          required={required}
          onChange={(e) => {
            setRegion(e.target.value);
            setCity("");
          }}
        >
          <option value="">{required ? "اختر المنطقة" : "كل المناطق"}</option>
          {regions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={className}>
        <span>المدينة</span>
        <select
          name={cityName}
          value={city}
          required={required}
          disabled={!region}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="">
            {!region
              ? "اختر المنطقة أولًا"
              : required
                ? "اختر المدينة"
                : "كل مدن المنطقة"}
          </option>
          {cities
            .filter((c) => c.regionId === region)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
    </>
  );
}
