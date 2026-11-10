import { test } from "node:test";
import assert from "node:assert/strict";
import { inSaudiBounds, pointInPolygon, type LatLng } from "../src/lib/geo";

const square: LatLng[] = [
  [24.7, 46.6],
  [24.7, 46.7],
  [24.8, 46.7],
  [24.8, 46.6],
];
test("point in polygon: inside, outside, on the edge and in a concave zone", () => {
  assert.equal(pointInPolygon([24.75, 46.65], square), true);
  assert.equal(pointInPolygon([24.85, 46.65], square), false);
  assert.equal(pointInPolygon([24.75, 46.75], square), false);
  assert.equal(pointInPolygon([24.7, 46.65], square), true, "edge counts");
  assert.equal(pointInPolygon([24.7, 46.6], square), true, "corner counts");
  // حرف L: الركن المقطوع خارج المنطقة.
  const ell: LatLng[] = [
    [0, 0],
    [0, 2],
    [1, 2],
    [1, 1],
    [2, 1],
    [2, 0],
  ];
  assert.equal(pointInPolygon([0.5, 1.5], ell), true);
  assert.equal(pointInPolygon([1.5, 1.5], ell), false);
  assert.equal(pointInPolygon([1.5, 0.5], ell), true);
});
test("Saudi bounds reject points far outside the kingdom", () => {
  assert.equal(inSaudiBounds([24.71, 46.67]), true);
  assert.equal(inSaudiBounds([21.42, 39.82]), true);
  assert.equal(inSaudiBounds([51.5, -0.12]), false);
  assert.equal(inSaudiBounds([0, 0]), false);
});
