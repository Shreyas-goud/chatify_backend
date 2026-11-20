import { test } from "node:test";
import assert from "node:assert/strict";
import { createBucket } from "../src/lib/rateLimit.js";

test("allows a burst, then refills over time", () => {
  let now = 0;
  const take = createBucket({ ratePerSec: 2, burst: 3 }, () => now);
  assert.deepEqual([take(), take(), take(), take()], [true, true, true, false]);
  now = 500; // half a second refills one token
  assert.equal(take(), true);
  assert.equal(take(), false);
  now = 60_000; // never refills past the burst
  assert.deepEqual([take(), take(), take(), take()], [true, true, true, false]);
});
