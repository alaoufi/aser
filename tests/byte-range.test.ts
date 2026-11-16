import { test } from "node:test";
import assert from "node:assert/strict";
import { byteRangeResponse } from "../src/server/byte-range";

test("voice playback answers byte ranges the way Safari asks for them", async () => {
  const data = new Uint8Array(Array.from({ length: 10 }, (_, i) => i));
  const h = { "Content-Type": "audio/mp4" };
  const full = byteRangeResponse(data, h, null);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("content-length"), "10");
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), data);
  // سفاري يبدأ بطلب أول بايتين.
  const probe = byteRangeResponse(data, h, "bytes=0-1");
  assert.equal(probe.status, 206);
  assert.equal(probe.headers.get("content-range"), "bytes 0-1/10");
  assert.deepEqual([...new Uint8Array(await probe.arrayBuffer())], [0, 1]);
  const open = byteRangeResponse(data, h, "bytes=7-");
  assert.equal(open.headers.get("content-range"), "bytes 7-9/10");
  assert.deepEqual([...new Uint8Array(await open.arrayBuffer())], [7, 8, 9]);
  const suffix = byteRangeResponse(data, h, "bytes=-3");
  assert.equal(suffix.headers.get("content-range"), "bytes 7-9/10");
  const past = byteRangeResponse(data, h, "bytes=5-99");
  assert.equal(past.headers.get("content-range"), "bytes 5-9/10");
  assert.equal(byteRangeResponse(data, h, "bytes=10-").status, 416);
  assert.equal(byteRangeResponse(data, h, "bytes=6-2").status, 416);
  assert.equal(byteRangeResponse(data, h, "items=0-1").status, 200);
});
