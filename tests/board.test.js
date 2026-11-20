import { test } from "node:test";
import assert from "node:assert/strict";
import { previewOf, shapeBoard } from "../src/lib/board.js";

const me = "a1";
const users = new Map([
  ["b2", { _id: "b2", fullName: "Ravi", username: "ravi", profilePic: "" }],
  ["c3", { _id: "c3", fullName: "Asha", username: "asha", profilePic: "" }],
  ["d4", { _id: "d4", fullName: "Dev", username: "dev", profilePic: "" }],
]);
const friendships = [
  { a: "a1", b: "b2", acceptedAt: new Date("2026-11-01") },
  { a: "a1", b: "c3", acceptedAt: new Date("2026-11-19") },
  { a: "a1", b: "d4", acceptedAt: new Date("2026-11-02") },
  { a: "a1", b: "zz", acceptedAt: new Date("2026-11-03") }, // deleted account
];
const stats = new Map([
  ["b2", { last: { _id: "m1", senderId: "b2", text: "see you at 8", createdAt: new Date("2026-11-20T10:00Z") }, unread: 2 }],
  ["d4", { last: { _id: "m2", senderId: "a1", image: "https://x/y.jpg", text: "", createdAt: new Date("2026-11-10") }, unread: 0 }],
]);

test("orders friends by latest activity, new friends by when they became friends", () => {
  const board = shapeBoard({ me, friendships, users, stats });
  assert.deepEqual(board.map((row) => row.username), ["ravi", "asha", "dev"]);
});

test("carries unread counts and previews, and skips deleted accounts", () => {
  const [ravi, asha, dev] = shapeBoard({ me, friendships, users, stats });
  assert.equal(ravi.unread, 2);
  assert.equal(ravi.lastMessage.fromMe, false);
  assert.equal(ravi.lastMessage.text, "see you at 8");
  assert.equal(asha.lastMessage, null);
  assert.equal(asha.unread, 0);
  assert.equal(dev.lastMessage.hasImage, true);
  assert.equal(dev.lastMessage.fromMe, true);
});

test("trims long previews", () => {
  const preview = previewOf({ _id: "x", senderId: "b2", text: "x".repeat(500), createdAt: new Date() }, me);
  assert.equal(preview.text.length, 140);
});
