import { test } from "node:test";
import assert from "node:assert/strict";
import { dialCodeOf, hashPhone, normalizePhone, phoneHint } from "../src/lib/phone.js";

test("normalizes the ways people write numbers", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhone("098765 43210"), "+919876543210"); // trunk 0, default India
  assert.equal(normalizePhone("98765-43210"), "+919876543210");
  assert.equal(normalizePhone("0091 9876543210"), "+919876543210");
  assert.equal(normalizePhone("(415) 555-0123", "1"), "+14155550123");
  assert.equal(normalizePhone("+1 415 555 0123"), "+14155550123");
});

test("rejects what can't be a phone number", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("+1234567890123456"), null);
  assert.equal(normalizePhone("9876543210", null), null); // no country to assume
});

test("hashes are stable SHA-256 hex", () => {
  assert.equal(hashPhone("+919876543210"), hashPhone(normalizePhone("98765 43210")));
  assert.match(hashPhone("+919876543210"), /^[a-f0-9]{64}$/);
});

test("hints show only the country code and last four digits", () => {
  assert.equal(phoneHint("+919876543210"), "+91 •••••• 3210");
  assert.equal(phoneHint("+14155550123"), "+1 •••••• 0123");
  assert.equal(dialCodeOf("+919876543210"), "91");
});
