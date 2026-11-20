// What other people may see about a user. Email and invite code stay private to their owner.
export const publicUser = (user) =>
  user && {
    _id: String(user._id),
    fullName: user.fullName,
    username: user.username,
    profilePic: user.profilePic || "",
  };

export const selfUser = (user) =>
  user && {
    ...publicUser(user),
    email: user.email,
    inviteCode: user.inviteCode,
    timezone: user.timezone,
    createdAt: user.createdAt,
    phoneHint: user.phoneHint ?? null,
    phoneDialCode: user.phoneDialCode ?? null,
    discoverableByPhone: user.discoverableByPhone !== false,
  };

export const serializeMessage = (message) => ({
  _id: String(message._id),
  senderId: String(message.senderId),
  receiverId: message.receiverId ? String(message.receiverId) : null,
  circleId: message.circleId ? String(message.circleId) : null,
  text: message.text ?? "",
  image: message.image ?? null,
  readAt: message.readAt ?? null,
  createdAt: message.createdAt,
});
