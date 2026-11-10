import { test } from "node:test";
import assert from "node:assert/strict";
import { regionOf } from "../src/lib/region-of";

test("the visitor's region is the nearest administrative region, nothing outside the kingdom", () => {
  assert.equal(regionOf([24.7136, 46.6753]), "riyadh");
  assert.equal(regionOf([21.5433, 39.1728]), "makkah");
  assert.equal(regionOf([26.4207, 50.0888]), "eastern");
  assert.equal(regionOf([18.2164, 42.5053]), "asir");
  assert.equal(regionOf([26.326, 43.975]), "qassim");
  assert.equal(regionOf([24.4686, 39.6142]), "madinah");
  assert.equal(regionOf([28.3835, 36.5662]), "tabuk");
  assert.equal(regionOf([16.8892, 42.5511]), "jazan");
  assert.equal(regionOf([51.5072, -0.1276]), null);
});
