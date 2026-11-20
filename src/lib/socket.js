import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import { areFriends, friendIdsOf } from "./friends.js";
import { createBucket } from "./rateLimit.js";
import Circle from "../models/Circle.js";
import User from "../models/User.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ENV.CLIENT_ORIGINS,
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

// Every socket joins a room named after its user, so one person with several tabs or devices
// is reached with one emit. They're online while any socket is open, and *active* while any of
// them has Chatify on screen (the page tells us through "activity").
const socketsOf = new Map(); // userId → Set(socket)
const friendsOf = new Map(); // userId → Set(friendIds), online users only
const circlesOf = new Map(); // userId → Map(circleId → Set(joined member ids)), online users only

export const isOnline = (userId) => socketsOf.has(String(userId));
export const isActive = (userId) => [...(socketsOf.get(String(userId)) ?? [])].some((s) => s.data.active);

export const emitToUser = (userId, event, payload) => io.to(String(userId)).emit(event, payload);
export const emitToUsers = (userIds, event, payload) => {
  if (userIds.length) io.to(userIds.map(String)).emit(event, payload);
};

const circleMatesOf = (userId) => {
  const mates = new Set();
  for (const members of circlesOf.get(userId)?.values() ?? []) for (const id of members) mates.add(id);
  mates.delete(userId);
  return mates;
};

// Who may see this person's presence: friends, plus everyone they share a Glass circle with.
const audienceOf = (userId) => new Set([...(friendsOf.get(userId) ?? []), ...circleMatesOf(userId)]);

async function loadAudience(userId) {
  const [friends, circles] = await Promise.all([
    friendIdsOf(userId),
    Circle.find({ members: { $elemMatch: { userId, status: "joined" } } }, { members: 1 }).lean(),
  ]);
  if (!isOnline(userId)) return;
  friendsOf.set(userId, new Set(friends));
  circlesOf.set(
    userId,
    new Map(
      circles.map((circle) => [
        String(circle._id),
        new Set(circle.members.filter((m) => m.status === "joined").map((m) => String(m.userId))),
      ])
    )
  );
}

const presenceOf = (userId) => ({ userId, online: isOnline(userId), active: isActive(userId) });

// After a friendship changes: refresh both caches and tell each whether the other is now visible.
export async function onFriendshipChanged(x, y) {
  [x, y] = [String(x), String(y)];
  await Promise.all([x, y].filter(isOnline).map(loadAudience));
  const visible = (await areFriends(x, y)) || circleMatesOf(x).has(y);
  emitToUser(x, "presence", visible ? presenceOf(y) : { userId: y, online: false, active: false });
  emitToUser(y, "presence", visible ? presenceOf(x) : { userId: x, online: false, active: false });
  emitToUser(x, "friends:changed");
  emitToUser(y, "friends:changed");
}

// After a circle's membership changes: refresh online members' caches, send everyone involved a
// fresh list, and share presence between members who can now see each other.
export async function onCircleChanged(circleId, alsoNotify = []) {
  const circle = await Circle.findById(circleId, { members: 1 }).lean();
  const memberIds = (circle?.members ?? []).map((m) => String(m.userId));
  const everyone = [...new Set([...memberIds, ...alsoNotify.map(String)])];
  await Promise.all(everyone.filter(isOnline).map(loadAudience));
  emitToUsers(everyone, "circles:changed");
  for (const id of everyone.filter(isOnline)) {
    const audience = audienceOf(id);
    for (const other of everyone) {
      if (other !== id) emitToUser(id, "presence", audience.has(other) ? presenceOf(other) : { userId: other, online: false, active: false });
    }
  }
}

function setActive(userId, socket, active) {
  const before = isActive(userId);
  socket.data.active = active;
  const after = isActive(userId);
  if (before === after) return;
  const at = new Date();
  User.updateOne({ _id: userId }, { lastActiveAt: at }).catch(() => {});
  for (const id of audienceOf(userId)) emitToUser(id, "presence", { ...presenceOf(userId), at });
}

io.on("connection", (socket) => {
  const userId = socket.userId;
  socket.join(userId);
  socket.data.active = false;
  const sockets = socketsOf.get(userId) ?? new Set();
  const firstSocket = sockets.size === 0;
  sockets.add(socket);
  socketsOf.set(userId, sockets);

  const typingAllowed = createBucket({ ratePerSec: 4, burst: 8 });
  socket.on("typing", (payload) => {
    if (!typingAllowed()) return;
    const on = Boolean(payload?.on);
    if (payload?.circleId) {
      const members = circlesOf.get(userId)?.get(String(payload.circleId));
      if (!members?.has(userId)) return;
      const others = [...members].filter((id) => id !== userId);
      return emitToUsers(others, "typing", { from: userId, circleId: String(payload.circleId), on });
    }
    const to = String(payload?.to ?? "");
    if (!friendsOf.get(userId)?.has(to)) return;
    emitToUser(to, "typing", { from: userId, on });
  });

  // The page reports whether Chatify is on screen (visible) or in the background.
  const activityAllowed = createBucket({ ratePerSec: 2, burst: 6 });
  socket.on("activity", (payload) => {
    if (activityAllowed()) setActive(userId, socket, Boolean(payload?.active));
  });

  socket.on("disconnect", () => {
    setActive(userId, socket, false);
    sockets.delete(socket);
    if (sockets.size > 0) return;
    socketsOf.delete(userId);
    const audience = audienceOf(userId);
    friendsOf.delete(userId);
    circlesOf.delete(userId);
    for (const id of audience) {
      emitToUser(id, "presence", { userId, online: false, active: false, at: new Date() });
      emitToUser(id, "typing", { from: userId, on: false });
    }
  });

  // Presence goes to friends and circle mates only: strangers never learn who is online.
  (friendsOf.has(userId) ? Promise.resolve() : loadAudience(userId))
    .then(() => {
      if (!socket.connected) return;
      const audience = audienceOf(userId);
      if (firstSocket) for (const id of audience) emitToUser(id, "presence", presenceOf(userId));
      socket.emit(
        "presence:init",
        [...audience].filter(isOnline).map((id) => presenceOf(id))
      );
    })
    .catch((error) => console.log("Failed to load audience for socket:", error.message));
});

export { io, app, server };
