const assert = require("node:assert/strict");
const test = require("node:test");
const { safeCompare } = require("../apps/selfhost/server.js");

test("safeCompare identifies matching strings", () => {
  assert.equal(safeCompare("correct-token", "correct-token"), true);
  assert.equal(safeCompare("", ""), true);
  assert.equal(safeCompare("a".repeat(100), "a".repeat(100)), true);
});

test("safeCompare identifies non-matching strings of same length", () => {
  assert.equal(safeCompare("token-one", "token-two"), false);
  assert.equal(safeCompare("abc", "abd"), false);
});

test("safeCompare identifies non-matching strings of different lengths", () => {
  assert.equal(safeCompare("short", "longer-token"), false);
  assert.equal(safeCompare("longer-token", "short"), false);
  assert.equal(safeCompare("", "non-empty"), false);
});

test("safeCompare handles non-string inputs gracefully", () => {
  assert.equal(safeCompare(null, "token"), false);
  assert.equal(safeCompare("token", undefined), false);
  assert.equal(safeCompare(123, 123), false);
  assert.equal(safeCompare({}, {}), false);
});
