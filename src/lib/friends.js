import Friendship from "../models/Friendship.js";

// The one stored shape of a pair: the smaller id in `a`, whoever asked.
export function pairOf(x, y) {
  const [a, b] = [String(x), String(y)].sort();
  return { a, b };
}

export const otherOf = (friendship, me) =>
  String(friendship.a) === String(me) ? String(friendship.b) : String(friendship.a);

export const involving = (userId) => ({ $or: [{ a: userId }, { b: userId }] });

export async function friendIdsOf(userId) {
  const rows = await Friendship.find({ status: "accepted", ...involving(userId) }, { a: 1, b: 1 }).lean();
  return rows.map((row) => otherOf(row, userId));
}

export async function areFriends(x, y) {
  return Boolean(await Friendship.exists({ ...pairOf(x, y), status: "accepted" }));
}
