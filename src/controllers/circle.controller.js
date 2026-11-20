import mongoose from "mongoose";
import Circle from "../models/Circle.js";
import Message from "../models/Message.js";
import Nudge from "../models/Nudge.js";
import User from "../models/User.js";
import { friendIdsOf } from "../lib/friends.js";
import { circleNameProblem, memberIdsProblem, nudgeWait } from "../lib/circles.js";
import { publicUser, serializeMessage } from "../lib/serialize.js";
import { uploadImage, UploadError } from "../lib/cloudinary.js";
import { pushTo } from "../lib/push.js";
import { emitToUser, emitToUsers, isActive, isOnline, onCircleChanged } from "../lib/socket.js";

const PAGE_SIZE = 50;
const MAX_TEXT = 2000;
const fail = (res, status, message) => res.status(status).json({ message });
const idOf = (value) => String(value);
const joinedIds = (circle) => circle.members.filter((m) => m.status === "joined").map((m) => idOf(m.userId));
const memberOf = (circle, userId) => circle.members.find((m) => idOf(m.userId) === idOf(userId));

const serializeNudge = (nudge) => ({
  _id: idOf(nudge._id),
  circleId: idOf(nudge.circleId),
  from: idOf(nudge.from),
  to: idOf(nudge.to),
  channel: nudge.channel,
  outcome: nudge.outcome,
  outcomeAt: nudge.outcomeAt ?? null,
  createdAt: nudge.createdAt,
});

// What a member sees of the circle. Attention cursors and activity are Glass data, so someone
// still deciding whether to join sees only names.
function serializeCircle(circle, me, users, extra = {}) {
  const mine = memberOf(circle, me);
  const joined = mine?.status === "joined";
  return {
    _id: idOf(circle._id),
    name: circle.name,
    createdBy: idOf(circle.createdBy),
    createdAt: circle.createdAt,
    lastMessageAt: circle.lastMessageAt ?? null,
    myStatus: mine?.status ?? null,
    invitedBy: mine?.invitedBy ? publicUser(users.get(idOf(mine.invitedBy))) : null,
    members: circle.members
      .filter((m) => users.has(idOf(m.userId)))
      .map((m) => {
        const user = users.get(idOf(m.userId));
        const base = { ...publicUser(user), status: m.status };
        if (!joined) return base;
        return {
          ...base,
          joinedAt: m.joinedAt ?? null,
          deliveredAt: m.deliveredAt ?? null,
          notifiedAt: m.notifiedAt ?? null,
          dismissedAt: m.dismissedAt ?? null,
          readAt: m.readAt ?? null,
          lastActiveAt: user.lastActiveAt ?? null,
          online: isOnline(user._id),
          active: isActive(user._id),
        };
      }),
    ...(joined ? extra : {}),
  };
}

async function usersFor(circles) {
  const ids = new Set();
  for (const circle of circles) {
    for (const m of circle.members) {
      ids.add(idOf(m.userId));
      if (m.invitedBy) ids.add(idOf(m.invitedBy));
    }
  }
  const users = await User.find({ _id: { $in: [...ids] } }, { fullName: 1, username: 1, profilePic: 1, lastActiveAt: 1 }).lean();
  return new Map(users.map((u) => [idOf(u._id), u]));
}

// Loads a circle the signed-in user has joined, or answers with the reason.
async function joinedCircle(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return fail(res, 404, "No such circle."), null;
  const circle = await Circle.findById(id);
  const mine = circle && memberOf(circle, req.user._id);
  if (!mine) return fail(res, 404, "No such circle."), null;
  if (mine.status !== "joined") return fail(res, 403, "Join the circle to see it."), null;
  return circle;
}

const preview = (message, me) =>
  message && {
    _id: idOf(message._id),
    senderId: idOf(message.senderId),
    text: (message.text ?? "").slice(0, 140),
    hasImage: Boolean(message.image),
    fromMe: idOf(message.senderId) === idOf(me),
    createdAt: message.createdAt,
  };

export const listCircles = async (req, res) => {
  try {
    const me = req.user._id;
    const circles = await Circle.find({ "members.userId": me }).lean();
    const users = await usersFor(circles);
    const rows = await Promise.all(
      circles.map(async (circle) => {
        const mine = memberOf(circle, me);
        if (mine.status !== "joined") return serializeCircle(circle, me, users);
        const [last, unread] = await Promise.all([
          Message.findOne({ circleId: circle._id }).sort({ createdAt: -1 }).lean(),
          Message.countDocuments({
            circleId: circle._id,
            senderId: { $ne: me },
            createdAt: { $gt: mine.readAt ?? mine.joinedAt ?? new Date(0) },
          }),
        ]);
        return serializeCircle(circle, me, users, { lastMessage: preview(last, me), unread });
      })
    );
    rows.sort((a, b) => new Date(b.lastMessageAt ?? b.createdAt) - new Date(a.lastMessageAt ?? a.createdAt));
    res.status(200).json(rows);
  } catch (error) {
    console.log("Error in listCircles:", error);
    fail(res, 500, "Internal server error");
  }
};

export const createCircle = async (req, res) => {
  try {
    const me = idOf(req.user._id);
    const nameProblem = circleNameProblem(req.body.name);
    if (nameProblem) return fail(res, 400, nameProblem);
    const memberProblem = memberIdsProblem(req.body.memberIds, me, await friendIdsOf(me));
    if (memberProblem) return fail(res, 400, memberProblem);

    const now = new Date();
    const others = [...new Set(req.body.memberIds.map(String))].filter((id) => id !== me);
    const circle = await Circle.create({
      name: String(req.body.name).trim(),
      createdBy: me,
      members: [
        { userId: me, status: "joined", joinedAt: now, readAt: now },
        ...others.map((userId) => ({ userId, status: "invited", invitedBy: me })),
      ],
    });

    await onCircleChanged(circle._id);
    for (const userId of others) {
      pushTo(userId, {
        type: "circle-invite",
        title: `${req.user.fullName} added you to ${circle.name}`,
        body: "A Glass circle: everyone sees when messages are read or ignored. Open to decide.",
        url: `/g/${circle._id}`,
        tag: `circle-invite-${circle._id}`,
      }).catch(() => {});
    }
    const users = await usersFor([circle]);
    res.status(201).json(serializeCircle(circle, me, users, { lastMessage: null, unread: 0 }));
  } catch (error) {
    console.log("Error in createCircle:", error);
    fail(res, 500, "Internal server error");
  }
};

// Joining is the consent: from now on this person's attention is visible to the circle.
export const joinCircle = async (req, res) => {
  try {
    const me = req.user._id;
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "No such circle.");
    const now = new Date();
    const updated = await Circle.findOneAndUpdate(
      { _id: req.params.id, members: { $elemMatch: { userId: me, status: "invited" } } },
      { $set: { "members.$.status": "joined", "members.$.joinedAt": now, "members.$.readAt": now } },
      { new: true }
    );
    if (!updated) return fail(res, 404, "This invitation is gone.");
    await onCircleChanged(updated._id);
    res.status(200).json({ status: "joined" });
  } catch (error) {
    console.log("Error in joinCircle:", error);
    fail(res, 500, "Internal server error");
  }
};

// Declining an invitation and leaving are the same thing. The last one out removes the circle.
export const leaveCircle = async (req, res) => {
  try {
    const me = req.user._id;
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, "No such circle.");
    const updated = await Circle.findOneAndUpdate(
      { _id: req.params.id, "members.userId": me },
      { $pull: { members: { userId: me } } },
      { new: true }
    );
    if (!updated) return fail(res, 404, "No such circle.");
    if (!updated.members.some((m) => m.status === "joined")) {
      await Promise.all([
        Circle.deleteOne({ _id: updated._id }),
        Message.deleteMany({ circleId: updated._id }),
        Nudge.deleteMany({ circleId: updated._id }),
      ]);
    }
    await onCircleChanged(updated._id, [me, ...updated.members.map((m) => m.userId)]);
    res.status(200).json({ status: "left" });
  } catch (error) {
    console.log("Error in leaveCircle:", error);
    fail(res, 500, "Internal server error");
  }
};

export const getCircleMessages = async (req, res) => {
  try {
    const circle = await joinedCircle(req, res);
    if (!circle) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE, 1), 100);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && Number.isNaN(before.getTime())) return fail(res, 400, "Bad page cursor.");

    const [page, nudges] = await Promise.all([
      Message.find({ circleId: circle._id, ...(before && { createdAt: { $lt: before } }) })
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean(),
      before ? [] : Nudge.find({ circleId: circle._id }).sort({ createdAt: -1 }).limit(30).lean(),
    ]);
    res.status(200).json({
      messages: page.slice(0, limit).reverse().map(serializeMessage),
      hasMore: page.length > limit,
      nudges: nudges.reverse().map(serializeNudge),
    });
  } catch (error) {
    console.log("Error in getCircleMessages:", error);
    fail(res, 500, "Internal server error");
  }
};

// Members with a live connection have it now: their deliveredAt moves. The rest get a push,
// and their service worker reports back when it's shown or swiped away.
export const sendCircleMessage = async (req, res) => {
  try {
    const circle = await joinedCircle(req, res);
    if (!circle) return;
    const me = idOf(req.user._id);

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const image = req.body.image;
    if (!text && !image) return fail(res, 400, "Write something or add a photo.");
    if (text.length > MAX_TEXT) return fail(res, 400, `Messages are at most ${MAX_TEXT} characters.`);
    if (image && (typeof image !== "string" || !image.startsWith("data:image/"))) {
      return fail(res, 400, "Only images can be attached.");
    }

    const imageUrl = image ? await uploadImage(image) : undefined;
    const message = await Message.create({ senderId: me, circleId: circle._id, text, image: imageUrl });
    const now = message.createdAt;
    const others = joinedIds(circle).filter((id) => id !== me);
    const connected = others.filter(isOnline);

    await Circle.updateOne(
      { _id: circle._id },
      {
        $set: {
          lastMessageAt: now,
          "members.$[sender].readAt": now,
          ...(connected.length && { "members.$[live].deliveredAt": now }),
        },
      },
      {
        arrayFilters: [
          { "sender.userId": new mongoose.Types.ObjectId(me) },
          ...(connected.length ? [{ "live.userId": { $in: connected.map((id) => new mongoose.Types.ObjectId(id)) } }] : []),
        ],
      }
    );

    // Replying is the answer to any nudge waiting on this person here.
    const answered = await Nudge.find({ circleId: circle._id, to: me, outcome: { $in: ["pending", "opened", "dismissed"] }, createdAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } });
    if (answered.length) {
      await Nudge.updateMany({ _id: { $in: answered.map((n) => n._id) } }, { outcome: "replied", outcomeAt: now });
    }

    const clientId = typeof req.body.clientId === "string" ? req.body.clientId.slice(0, 64) : undefined;
    const payload = { ...serializeMessage(message), circleId: idOf(circle._id), clientId };
    const audience = joinedIds(circle);
    emitToUsers(audience, "circle:message", payload);
    emitToUsers(audience, "circle:attention", {
      circleId: idOf(circle._id),
      updates: [{ userId: me, readAt: now }, ...connected.map((userId) => ({ userId, deliveredAt: now }))],
    });
    for (const nudge of answered) {
      emitToUsers(audience, "nudge:updated", serializeNudge({ ...nudge.toObject(), outcome: "replied", outcomeAt: now }));
    }
    res.status(201).json(payload);

    for (const userId of others.filter((id) => !isActive(id))) {
      pushTo(userId, {
        type: "circle-message",
        circleId: idOf(circle._id),
        title: circle.name,
        body: `${req.user.fullName.split(" ")[0]}: ${text || "Photo"}`,
        url: `/g/${circle._id}`,
        tag: `circle-${circle._id}`,
      }).catch(() => {});
    }
  } catch (error) {
    if (error instanceof UploadError) return fail(res, error.status, error.message);
    console.log("Error in sendCircleMessage:", error);
    fail(res, 500, "Internal server error");
  }
};

export const readCircle = async (req, res) => {
  try {
    const circle = await joinedCircle(req, res);
    if (!circle) return;
    const me = req.user._id;
    const now = new Date();
    await Circle.updateOne(
      { _id: circle._id, "members.userId": me },
      { $set: { "members.$.readAt": now, "members.$.deliveredAt": now } }
    );
    emitToUsers(joinedIds(circle), "circle:attention", {
      circleId: idOf(circle._id),
      updates: [{ userId: idOf(me), readAt: now, deliveredAt: now }],
    });
    res.status(200).json({ at: now });
  } catch (error) {
    console.log("Error in readCircle:", error);
    fail(res, 500, "Internal server error");
  }
};

export const nudgeMember = async (req, res) => {
  try {
    const circle = await joinedCircle(req, res);
    if (!circle) return;
    const me = idOf(req.user._id);
    const to = idOf(req.params.userId);
    if (to === me) return fail(res, 400, "You can't nudge yourself.");
    if (memberOf(circle, to)?.status !== "joined") return fail(res, 404, "They're not in this circle.");

    const last = await Nudge.findOne({ circleId: circle._id, from: me, to }).sort({ createdAt: -1 }).lean();
    const wait = nudgeWait(last?.createdAt);
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60000);
      return fail(res, 429, `You nudged them recently. Give them ${minutes} more minute${minutes === 1 ? "" : "s"}.`);
    }

    // On screen: a pop-up they have to answer. Not on screen: a push that stays until they do.
    const latest = await Message.findOne({ circleId: circle._id }).sort({ createdAt: -1 }).lean();
    let channel = "none";
    let nudge;
    if (isActive(to)) {
      channel = "popup";
      nudge = await Nudge.create({ circleId: circle._id, from: me, to, channel });
      emitToUser(to, "nudge", {
        ...serializeNudge(nudge),
        circleName: circle.name,
        fromUser: publicUser(req.user),
        preview: latest ? (latest.text || "Photo").slice(0, 140) : null,
      });
    } else {
      nudge = await Nudge.create({ circleId: circle._id, from: me, to, channel: "push" });
      const sent = await pushTo(
        to,
        {
          type: "nudge",
          nudgeId: idOf(nudge._id),
          circleId: idOf(circle._id),
          title: `${req.user.fullName.split(" ")[0]} is waiting for you`,
          body: `In ${circle.name}${latest?.text ? `: “${latest.text.slice(0, 80)}”` : ""}`,
          url: `/g/${circle._id}`,
          tag: `nudge-${circle._id}`,
          requireInteraction: true,
        },
        { urgency: "high", ttl: 60 * 60 }
      );
      if (sent > 0) channel = "push";
      else await Nudge.updateOne({ _id: nudge._id }, { channel: "none" });
      nudge.channel = channel;
    }

    const payload = serializeNudge(nudge);
    emitToUsers(joinedIds(circle), "nudge:updated", payload);
    res.status(201).json(payload);
  } catch (error) {
    console.log("Error in nudgeMember:", error);
    fail(res, 500, "Internal server error");
  }
};

const NUDGE_OUTCOMES = new Set(["opened", "dismissed"]);

// The nudged person answered the pop-up or notification. "Opened" can still turn into
// "replied" when they send something; "dismissed" stays visible until they reply.
async function settleNudge(nudgeId, userId, outcome) {
  if (!mongoose.isValidObjectId(nudgeId) || !NUDGE_OUTCOMES.has(outcome)) return null;
  const nudge = await Nudge.findOneAndUpdate(
    { _id: nudgeId, to: userId, outcome: "pending" },
    { outcome, outcomeAt: new Date() },
    { new: true }
  ).lean();
  if (!nudge) return null;
  const circle = await Circle.findById(nudge.circleId, { members: 1 }).lean();
  if (circle) emitToUsers(joinedIds(circle), "nudge:updated", serializeNudge(nudge));
  return nudge;
}

export const answerNudge = async (req, res) => {
  try {
    const nudge = await settleNudge(req.params.id, req.user._id, req.body.outcome);
    res.status(200).json({ updated: Boolean(nudge) });
  } catch (error) {
    console.log("Error in answerNudge:", error);
    fail(res, 500, "Internal server error");
  }
};

const RECEIPTS = new Set(["shown", "dismissed", "opened"]);

// Reports from the service worker about a notification: shown, swiped away, or tapped.
export const attentionReceipt = async (req, res) => {
  try {
    const me = req.user._id;
    const { kind, circleId, nudgeId } = req.body ?? {};
    if (!RECEIPTS.has(kind)) return fail(res, 400, "Unknown receipt.");

    if (nudgeId && kind !== "shown") await settleNudge(nudgeId, me, kind === "opened" ? "opened" : "dismissed");

    if (circleId && mongoose.isValidObjectId(circleId)) {
      const now = new Date();
      const set =
        kind === "shown"
          ? { "members.$.notifiedAt": now, "members.$.deliveredAt": now }
          : kind === "dismissed"
            ? { "members.$.dismissedAt": now }
            : null;
      if (set) {
        const circle = await Circle.findOneAndUpdate(
          { _id: circleId, members: { $elemMatch: { userId: me, status: "joined" } } },
          { $set: set },
          { new: true, projection: { members: 1 } }
        ).lean();
        if (circle) {
          const update = { userId: idOf(me) };
          for (const [key, value] of Object.entries(set)) update[key.split(".").at(-1)] = value;
          emitToUsers(joinedIds(circle), "circle:attention", { circleId: idOf(circle._id), updates: [update] });
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error in attentionReceipt:", error);
    fail(res, 500, "Internal server error");
  }
};
