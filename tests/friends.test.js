import { test } from "node:test";
import assert from "node:assert/strict";
import { otherOf, pairOf } from "../src/lib/friends.js";

test("a pair has one stored shape whoever asks", () => {
  const x = "65a0000000000000000000ff";
  const y = "65a000000000000000000001";
  assert.deepEqual(pairOf(x, y), pairOf(y, x));
  assert.equal(pairOf(x, y).a, y);
});

test("finds the other person in a friendship", () => {
  const row = { a: "1", b: "2" };
  assert.equal(otherOf(row, "1"), "2");
  assert.equal(otherOf(row, "2"), "1");
});
