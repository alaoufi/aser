import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceLabel,
  phoneNumber,
  safeUrl,
  safeMediaUrl,
  ProductCard,
} from "../src/components/public/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Product } from "../src/lib/types";
test("uploaded media renders in cards while unsafe relative paths remain blocked", () => {
  const path = "/api/media/00000000-0000-0000-0000-000000000001";
  assert.equal(safeMediaUrl(path), path);
  for (const value of [
    "//evil.example/image",
    "/api/media/../private",
    "/relative",
    "javascript:alert(1)",
  ])
    assert.equal(safeMediaUrl(value), null);
  assert.equal(safeUrl(path), null);
  const product = {
    id: "one",
    name: "منتج اختبار",
    imageUrl: path,
    status: "available",
    price: null,
    cityName: "الرياض",
    producerName: "أسرة الاختبار",
  } as Product;
  assert.match(
    renderToStaticMarkup(createElement(ProductCard, { product })),
    new RegExp('src="' + path + '"'),
  );
});
test("contact price stays an inquiry, distinct from a numeric zero", () => {
  assert.equal(priceLabel(null), "استفسر عن السعر");
  assert.notEqual(priceLabel(0), priceLabel(null));
  assert.match(priceLabel(45), /ر\.س/);
});
test("public links reject script protocols and malformed values", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<h1>hi</h1>"), null);
  assert.equal(safeUrl("/relative"), null);
  assert.equal(safeUrl("https://example.com/"), "https://example.com/");
});
test("phone contacts normalize Saudi local numbers and reject control syntax", () => {
  assert.equal(phoneNumber("050 123 4567"), "966501234567");
  assert.equal(phoneNumber("+966 (50) 123-4567"), "966501234567");
  assert.equal(phoneNumber("00966501234567"), "966501234567");
  assert.equal(phoneNumber("0501234567;123"), null);
  assert.equal(phoneNumber("abc"), null);
});
