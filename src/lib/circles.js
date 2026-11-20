// Rules for Glass circles, kept pure so they're unit-tested.

export const MAX_MEMBERS = 8; // including the creator
export const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;

export function circleNameProblem(name) {
  const value = String(name ?? "").trim();
  if (!value) return "Give the circle a name.";
  if (value.length > 40) return "Circle names are at most 40 characters.";
  return null;
}

// memberIds: the people the creator picked. Everyone must be the creator's friend.
export function memberIdsProblem(memberIds, me, friendIds) {
  if (!Array.isArray(memberIds)) return "Pick who's in the circle.";
  const unique = [...new Set(memberIds.map(String))].filter((id) => id !== String(me));
  if (unique.length < 1) return "A circle needs at least one other person.";
  if (unique.length > MAX_MEMBERS - 1) return `Circles are at most ${MAX_MEMBERS} people, you included.`;
  const friends = new Set(friendIds.map(String));
  if (unique.some((id) => !friends.has(id))) return "You can only add friends to a circle.";
  return null;
}

// A nudge per person per circle every ten minutes: enough to be felt, not enough to harass.
export function nudgeWait(lastNudgeAt, now = new Date()) {
  if (!lastNudgeAt) return 0;
  return Math.max(0, NUDGE_COOLDOWN_MS - (now - new Date(lastNudgeAt)));
}
