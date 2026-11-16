import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLOOD_LIMITS,
  floodBucket,
  floodCheck,
  floodReset,
} from "../src/lib/flood";

test("flood guard: per-address limits per minute, separate buckets, first refusal flagged once", () => {
  floodReset();
  assert.equal(floodBucket("GET", "/"), "page");
  assert.equal(floodBucket("GET", "/api/products"), "api-read");
  assert.equal(floodBucket("POST", "/api/orders"), "api-write");
  assert.equal(floodBucket("DELETE", "/api/conversations/x"), "api-write");
  assert.equal(floodBucket("GET", "/api/live"), "live");
  const t0 = 1_000_000;
  const limit = FLOOD_LIMITS["api-write"];
  for (let i = 0; i < limit; i++)
    assert.equal(floodCheck("203.0.113.5", "api-write", t0).ok, true);
  const first = floodCheck("203.0.113.5", "api-write", t0 + 1000);
  assert.deepEqual(first, { ok: false, retryAfter: 59, first: true });
  const again = floodCheck("203.0.113.5", "api-write", t0 + 2000);
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.first, false);
  // عنوان آخر ونوع آخر لا يتأثران.
  assert.equal(floodCheck("203.0.113.6", "api-write", t0).ok, true);
  assert.equal(floodCheck("203.0.113.5", "api-read", t0).ok, true);
  // بعد الدقيقة يعود مسموحًا.
  assert.equal(floodCheck("203.0.113.5", "api-write", t0 + 60_001).ok, true);
  floodReset();
});
