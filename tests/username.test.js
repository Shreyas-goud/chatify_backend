import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUsername, uniqueUsername, usernameBase, usernameProblem } from "../src/lib/username.js";

test("normalizes a typed handle", () => {
  assert.equal(normalizeUsername("  @Ravi_K "), "ravi_k");
});

test("accepts good usernames and explains bad ones", () => {
  assert.equal(usernameProblem("ravi.k_99"), null);
  assert.match(usernameProblem("ab"), /3 to 20/);
  assert.match(usernameProblem("ravi k"), /letters, numbers/);
  assert.match(usernameProblem("_ravi"), /Start and end/);
  assert.match(usernameProblem("ravi."), /Start and end/);
  assert.match(usernameProblem("ra..vi"), /two dots/);
  assert.match(usernameProblem("admin"), /reserved/);
});

test("builds a base from the name, then the email, then a default", () => {
  assert.equal(usernameBase("Shreyas Goud", "x@y.z"), "shreyasgoud");
  assert.equal(usernameBase("Zoë Ångström", "x@y.z"), "zoeangstrom");
  assert.equal(usernameBase("李", "dev.ops@x.com"), "devops");
  assert.equal(usernameBase("!!", "@x.com"), "friend");
  assert.equal(usernameBase("A very long name indeed", "x@y.z").length, 15);
});

test("finds the first free username", async () => {
  const taken = new Set(["ravi", "ravi2"]);
  assert.equal(await uniqueUsername("ravi", async (u) => taken.has(u)), "ravi3");
  assert.equal(await uniqueUsername("asha", async (u) => taken.has(u)), "asha");
});

test("falls back to random digits when base..base9 are taken", async () => {
  const name = await uniqueUsername("ravi", async (u) => /^ravi\d?$/.test(u));
  assert.match(name, /^ravi\d{4}$/);
});
