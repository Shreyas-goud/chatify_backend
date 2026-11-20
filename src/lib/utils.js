import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

// Deployed, the app and the API are different sites (Vercel and Render), so the cookie needs
// SameSite=None, which browsers only accept together with Secure. Local dev runs on plain http,
// where Secure is off, so it uses Lax: localhost:5173 and localhost:3000 count as the same site.
export const authCookieOptions = () => {
  const deployed = ENV.NODE_ENV !== "development";
  return {
    httpOnly: true, // prevent XSS attacks: cross-site scripting
    sameSite: deployed ? "none" : "lax",
    secure: deployed,
  };
};

export const generateToken = (userId, res) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("jwt", token, {
    ...authCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // MS
  });

  return token;
};

// http://localhost
// https://dsmakmk.com
