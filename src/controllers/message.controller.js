import mongoose from "mongoose";
import { uploadImage, UploadError } from "../lib/cloudinary.js";
import { emitToUser, isActive } from "../lib/socket.js";
import { pushTo } from "../lib/push.js";
import { areFriends, pairOf } from "../lib/friends.js";
import { serializeMessage } from "../lib/serialize.js";
import Friendship from "../models/Friendship.js";
import Message from "../models/Message.js";

const PAGE_SIZE = 50;
const MAX_TEXT = 2000;
const fail = (res, status, message) => res.status(status).json({ message });

// Resolves :userId to a friend of the signed-in user, or answers the request with the reason.
async function friendFrom(req, res) {
  const me = String(req.user._id);
  const them = String(req.params.userId);
  if (!mongoose.isValidObjectId(them)) return fail(res, 400, "Unknown person."), null;
  if (them === me) return fail(res, 400, "You can't message yourself."), null;
  if (!(await areFriends(me, them))) return fail(res, 403, "You can only message friends."), null;
  return { me, them };
}

// Newest page first; `before` (an ISO date) pages further back.
export const getMessages = async (req, res) => {
  try {
    const pair = await friendFrom(req, res);
    if (!pair) return;
    const { me, them } = pair;

    const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE, 1), 100);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && Number.isNaN(before.getTime())) return fail(res, 400, "Bad page cursor.");

    const page = await Message.find({
      $or: [
        { senderId: me, receiverId: them },
        { senderId: them, receiverId: me },
      ],
      ...(before && { createdAt: { $lt: before } }),
    })
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = page.length > limit;
    res.status(200).json({
      messages: page.slice(0, limit).reverse().map(serializeMessage),
      hasMore,
    });
  } catch (error) {
    console.log("Error in getMessages:", error);
    fail(res, 500, "Internal server error");
  }
};

export const sendMessage = async (req, res) => {
  try {
    const pair = await friendFrom(req, res);
    if (!pair) return;
    const { me, them } = pair;

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const image = req.body.image;
    if (!text && !image) return fail(res, 400, "Write something or add a photo.");
    if (text.length > MAX_TEXT) return fail(res, 400, `Messages are at most ${MAX_TEXT} characters.`);
    if (image && (typeof image !== "string" || !image.startsWith("data:image/"))) {
      return fail(res, 400, "Only images can be attached.");
    }

    const imageUrl = image ? await uploadImage(image) : undefined;
    const message = await Message.create({ senderId: me, receiverId: them, text, image: imageUrl });
    await Friendship.updateOne(pairOf(me, them), { lastMessageAt: message.createdAt });

    // clientId is the sender's temporary id, echoed (not stored) so the sender's tabs can swap
    // their optimistic copy for this one whether the socket or the HTTP reply arrives first.
    const clientId = typeof req.body.clientId === "string" ? req.body.clientId.slice(0, 64) : undefined;
    const payload = { ...serializeMessage(message), clientId };
    emitToUser(them, "message:new", payload);
    emitToUser(me, "message:new", payload); // the sender's other tabs
    res.status(201).json(payload);

    // Not looking at Chatify (closed, or in the background on a phone): notify their devices.
    if (!isActive(them)) {
      pushTo(them, {
        type: "message",
        title: req.user.fullName,
        body: text || "Photo",
        url: `/c/${req.user.username}`,
        tag: `dm-${me}`,
      }).catch(() => {});
    }
  } catch (error) {
    if (error instanceof UploadError) return fail(res, error.status, error.message);
    console.log("Error in sendMessage:", error);
    fail(res, 500, "Internal server error");
  }
};

// The signed-in user has seen everything this friend sent them so far.
export const markRead = async (req, res) => {
  try {
    const pair = await friendFrom(req, res);
    if (!pair) return;
    const { me, them } = pair;

    const at = new Date();
    const { modifiedCount } = await Message.updateMany(
      { senderId: them, receiverId: me, readAt: null, createdAt: { $lte: at } },
      { readAt: at }
    );
    if (modifiedCount > 0) {
      const receipt = { readerId: me, partnerId: them, at };
      emitToUser(them, "messages:read", receipt); // their SENT turns to SEEN
      emitToUser(me, "messages:read", receipt); // my other tabs clear the unread count
    }
    res.status(200).json({ read: modifiedCount, at });
  } catch (error) {
    console.log("Error in markRead:", error);
    fail(res, 500, "Internal server error");
  }
};
