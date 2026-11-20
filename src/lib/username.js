import crypto from "crypto";

const RESERVED = new Set([
  "admin", "api", "add", "chatify", "drop", "help", "i", "login", "logout", "me", "official",
  "root", "settings", "signup", "support", "system", "you",
]);

export const normalizeUsername = (raw) =>
  String(raw ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

// Returns what is wrong with a normalized username, or null when it is fine.
export function usernameProblem(username) {
  if (username.length < 3 || username.length > 20) return "Usernames are 3 to 20 characters.";
  if (!/^[a-z0-9._]+$/.test(username)) return "Use only letters, numbers, dots and underscores.";
  if (!/^[a-z0-9]/.test(username) || !/[a-z0-9]$/.test(username))
    return "Start and end with a letter or a number.";
  if (/[._]{2}/.test(username)) return "No two dots or underscores in a row.";
  if (RESERVED.has(username)) return "That username is reserved.";
  return null;
}

const slug = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// A readable starting point for a generated username: the name, else the email's local part.
export function usernameBase(fullName, email) {
  for (const source of [fullName, String(email ?? "").split("@")[0]]) {
    const base = slug(source).slice(0, 15);
    if (base.length >= 3 && !usernameProblem(base)) return base;
  }
  return "friend";
}

// base, base2 … base9, then base + four random digits until one is free.
export async function uniqueUsername(base, isTaken) {
  for (let n = 1; n <= 9; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  for (;;) {
    const candidate = `${base}${crypto.randomInt(1000, 10000)}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}

// 8 URL-safe characters: hard to guess, short enough to share.
export const newInviteCode = () => crypto.randomBytes(6).toString("base64url");
