import mongoose from "mongoose";
import Friendship from "../models/Friendship.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { involving, otherOf, pairOf } from "../lib/friends.js";
import { shapeBoard } from "../lib/board.js";
import { publicUser } from "../lib/serialize.js";
import { normalizeUsername } from "../lib/username.js";
import { onFriendshipChanged } from "../lib/socket.js";

const fail = (res, status, message) => res.status(status).json({ message });
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Last message and unread count per friend, in one pass over this user's messages.
async function messageStats(me, partnerIds) {
  const myId = new mongoose.Types.ObjectId(String(me));
  const partners = partnerIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await Message.aggregate([
    {
      $match: {
        $or: [
          { senderId: myId, receiverId: { $in: partners } },
          { receiverId: myId, senderId: { $in: partners } },
        ],
      },
    },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $cond: [{ $eq: ["$senderId", myId] }, "$receiverId", "$senderId"] },
        last: { $first: "$$ROOT" },
        unread: {
          $sum: {
            $cond: [{ $and: [{ $eq: ["$receiverId", myId] }, { $eq: ["$readAt", null] }] }, 1, 0],
          },
        },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), { last: row.last, unread: row.unread }]));
}

// The home board: friends with their latest message and unread count, plus open requests.
export const listFriends = async (req, res) => {
  try {
    const me = String(req.user._id);
    const rows = await Friendship.find(involving(me)).lean();
    const otherIds = rows.map((row) => otherOf(row, me));
    const users = new Map(
      (await User.find({ _id: { $in: otherIds } }).lean()).map((u) => [String(u._id), publicUser(u)])
    );

    const accepted = rows.filter((row) => row.status === "accepted");
    const stats = await messageStats(me, accepted.map((row) => otherOf(row, me)));
    const pending = (row) => ({ ...users.get(otherOf(row, me)), requestedAt: row.createdAt });

    res.status(200).json({
      friends: shapeBoard({ me, friendships: accepted, users, stats }),
      incoming: rows
        .filter((row) => row.status === "pending" && String(row.requestedBy) !== me && users.has(otherOf(row, me)))
        .map(pending),
      outgoing: rows
        .filter((row) => row.status === "pending" && String(row.requestedBy) === me && users.has(otherOf(row, me)))
        .map(pending),
    });
  } catch (error) {
    console.log("Error in listFriends:", error);
    fail(res, 500, "Internal server error");
  }
};

// Username prefix search, each result tagged with how it relates to the searcher.
export const searchUsers = async (req, res) => {
  const q = normalizeUsername(req.query.q);
  if (q.length < 2) return res.status(200).json([]);
  try {
    const me = String(req.user._id);
    const users = await User.find({ username: new RegExp(`^${escapeRegex(q)}`), _id: { $ne: me } })
      .sort({ username: 1 })
      .limit(8)
      .lean();
    if (users.length === 0) return res.status(200).json([]);
    const links = await Friendship.find({
      $or: users.map((u) => pairOf(me, u._id)),
    }).lean();
    const relationOf = new Map(
      links.map((row) => [
        otherOf(row, me),
        row.status === "accepted" ? "friend" : String(row.requestedBy) === me ? "outgoing" : "incoming",
      ])
    );
    res.status(200).json(
      users.map((u) => ({ ...publicUser(u), relation: relationOf.get(String(u._id)) ?? "none" }))
    );
  } catch (error) {
    console.log("Error in searchUsers:", error);
    fail(res, 500, "Internal server error");
  }
};

// Sends a request, or accepts theirs if they already asked.
export const requestFriend = async (req, res) => {
  try {
    const me = String(req.user._id);
    const target = await User.findOne({ username: normalizeUsername(req.body.username) });
    if (!target) return fail(res, 404, "No one has that username.");
    const them = String(target._id);
    if (them === me) return fail(res, 400, "That's you.");

    const pair = pairOf(me, them);
    const existing = await Friendship.findOne(pair);
    if (existing?.status === "accepted") return res.status(200).json({ status: "friend" });
    if (existing && String(existing.requestedBy) === me) return res.status(200).json({ status: "outgoing" });

    if (existing) {
      existing.status = "accepted";
      existing.acceptedAt = new Date();
      await existing.save();
    } else {
      await Friendship.create({ ...pair, status: "pending", requestedBy: me });
    }
    await onFriendshipChanged(me, them);
    res.status(200).json({ status: existing ? "friend" : "outgoing" });
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ status: "outgoing" });
    console.log("Error in requestFriend:", error);
    fail(res, 500, "Internal server error");
  }
};

export const acceptFriend = async (req, res) => {
  try {
    const me = String(req.user._id);
    const them = String(req.params.userId);
    if (!mongoose.isValidObjectId(them)) return fail(res, 400, "Unknown person.");
    const updated = await Friendship.findOneAndUpdate(
      { ...pairOf(me, them), status: "pending", requestedBy: them },
      { status: "accepted", acceptedAt: new Date() },
      { new: true }
    );
    if (!updated) return fail(res, 404, "That request is gone.");
    await onFriendshipChanged(me, them);
    res.status(200).json({ status: "friend" });
  } catch (error) {
    console.log("Error in acceptFriend:", error);
    fail(res, 500, "Internal server error");
  }
};

// Declines a request, cancels your own, or unfriends. Messages stay; sending needs a friendship.
export const removeFriend = async (req, res) => {
  try {
    const me = String(req.user._id);
    const them = String(req.params.userId);
    if (!mongoose.isValidObjectId(them)) return fail(res, 400, "Unknown person.");
    await Friendship.deleteOne(pairOf(me, them));
    await onFriendshipChanged(me, them);
    res.status(200).json({ status: "none" });
  } catch (error) {
    console.log("Error in removeFriend:", error);
    fail(res, 500, "Internal server error");
  }
};

// Public: who sent this invite link, shown before sign-in.
export const invitePreview = async (req, res) => {
  try {
    const inviter = await User.findOne({ inviteCode: String(req.params.code) }).lean();
    if (!inviter) return fail(res, 404, "This invite link doesn't work any more.");
    res.status(200).json(publicUser(inviter));
  } catch (error) {
    console.log("Error in invitePreview:", error);
    fail(res, 500, "Internal server error");
  }
};

// Opening someone's invite link makes you friends at once: sharing the link was their consent.
export const acceptInvite = async (req, res) => {
  try {
    const me = String(req.user._id);
    const inviter = await User.findOne({ inviteCode: String(req.params.code) }).lean();
    if (!inviter) return fail(res, 404, "This invite link doesn't work any more.");
    const them = String(inviter._id);
    if (them === me) return fail(res, 400, "That's your own invite link.");

    // Already friends keeps the original "friends since" date.
    await Friendship.updateOne(
      { ...pairOf(me, them), status: { $ne: "accepted" } },
      {
        $set: { status: "accepted", acceptedAt: new Date() },
        $setOnInsert: { requestedBy: them },
      },
      { upsert: true }
    ).catch((error) => {
      if (error?.code !== 11000) throw error; // duplicate key: the pair is already accepted
    });
    await onFriendshipChanged(me, them);
    res.status(200).json({ status: "friend", friend: publicUser(inviter) });
  } catch (error) {
    console.log("Error in acceptInvite:", error);
    fail(res, 500, "Internal server error");
  }
};

const HASH = /^[a-f0-9]{64}$/;

// "Who from my contacts is on Chatify?" The browser sends SHA-256 hashes of the numbers the
// person picked (never the numbers), matched against people who allow being found by phone.
export const matchContacts = async (req, res) => {
  const hashes = Array.isArray(req.body?.hashes) ? req.body.hashes.filter((h) => HASH.test(h)).slice(0, 1000) : [];
  if (hashes.length === 0) return res.status(200).json([]);
  try {
    const me = String(req.user._id);
    const users = await User.find({
      phoneHash: { $in: hashes },
      discoverableByPhone: { $ne: false },
      _id: { $ne: me },
    })
      .limit(100)
      .lean();
    if (users.length === 0) return res.status(200).json([]);
    const links = await Friendship.find({ $or: users.map((u) => pairOf(me, u._id)) }).lean();
    const relationOf = new Map(
      links.map((row) => [
        otherOf(row, me),
        row.status === "accepted" ? "friend" : String(row.requestedBy) === me ? "outgoing" : "incoming",
      ])
    );
    res.status(200).json(
      users.map((u) => ({ ...publicUser(u), relation: relationOf.get(String(u._id)) ?? "none" }))
    );
  } catch (error) {
    console.log("Error in matchContacts:", error);
    fail(res, 500, "Internal server error");
  }
};
