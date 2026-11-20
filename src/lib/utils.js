import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

const requireSecret = () => {
  if (!ENV.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return ENV.JWT_SECRET;
};

// The website reaches the API through its own domain (Vercel rewrites /api to Render, and Vite
// proxies it in dev), so the cookie is first-party and Lax works everywhere, Safari included.
export const authCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: ENV.NODE_ENV !== "development",
});

export const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, requireSecret(), { expiresIn: "7d" });
  res.cookie("jwt", token, { ...authCookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
  return token;
};

// The socket connects straight to Render (Vercel can't pass WebSockets through), where the
// first-party cookie isn't sent. It authenticates with this short-lived token instead.
export const createSocketToken = (userId) =>
  jwt.sign({ userId: String(userId), purpose: "socket" }, requireSecret(), { expiresIn: "2m" });

export const verifyToken = (token) => jwt.verify(token, requireSecret());
