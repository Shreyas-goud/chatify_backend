import { test } from "node:test";
import assert from "node:assert/strict";
import { circleNameProblem, memberIdsProblem, nudgeWait, NUDGE_COOLDOWN_MS } from "../src/lib/circles.js";

test("circle names are required and short", () => {
  assert.equal(circleNameProblem("Hostel gang"), null);
  assert.match(circleNameProblem("   "), /name/);
  assert.match(circleNameProblem("x".repeat(41)), /40/);
});

test("members must be friends, 1 to 7 others, no duplicates or self", () => {
  const friends = ["b", "c", "d", "e", "f", "g", "h", "i"];
  assert.equal(memberIdsProblem(["b", "c", "b", "a"], "a", friends), null);
  assert.match(memberIdsProblem(["a"], "a", friends), /at least one/);
  assert.match(memberIdsProblem(["b", "c", "d", "e", "f", "g", "h", "i"], "a", friends), /at most 8/);
  assert.match(memberIdsProblem(["b", "stranger"], "a", friends), /only add friends/);
  assert.match(memberIdsProblem("b", "a", friends), /Pick/);
});

test("one nudge per person per circle every ten minutes", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(nudgeWait(null, now), 0);
  assert.equal(nudgeWait(new Date(now - 4 * 60 * 1000), now), 6 * 60 * 1000);
  assert.equal(nudgeWait(new Date(now - NUDGE_COOLDOWN_MS - 1), now), 0);
});
