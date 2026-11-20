// Turns friendships plus per-partner message stats into the home board: one row per friend,
// most recent conversation first. Pure, so the ordering and preview rules are unit-tested.

const PREVIEW_LENGTH = 140;

export function previewOf(message, me) {
  if (!message) return null;
  return {
    _id: String(message._id),
    text: message.text ? message.text.slice(0, PREVIEW_LENGTH) : "",
    hasImage: Boolean(message.image),
    fromMe: String(message.senderId) === String(me),
    createdAt: message.createdAt,
    readAt: message.readAt ?? null,
  };
}

// friendships: accepted Friendship docs; users: Map(id → public user);
// stats: Map(partnerId → { last, unread }) from the messages aggregation.
export function shapeBoard({ me, friendships, users, stats }) {
  const rows = [];
  for (const friendship of friendships) {
    const partnerId = String(friendship.a) === String(me) ? String(friendship.b) : String(friendship.a);
    const user = users.get(partnerId);
    if (!user) continue; // the account was deleted
    const stat = stats.get(partnerId);
    const lastMessage = previewOf(stat?.last, me);
    rows.push({
      ...user,
      friendSince: friendship.acceptedAt ?? friendship.createdAt,
      lastMessage,
      unread: stat?.unread ?? 0,
      lastActivityAt: lastMessage?.createdAt ?? friendship.acceptedAt ?? friendship.createdAt,
    });
  }
  return rows.sort((x, y) => new Date(y.lastActivityAt) - new Date(x.lastActivityAt));
}
