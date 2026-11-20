import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../emails/emailHandlers.js";
import { authCookieOptions, createSocketToken, generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import { ENV } from "../lib/env.js";
import { uploadImage, UploadError } from "../lib/cloudinary.js";
import { publicUser, selfUser } from "../lib/serialize.js";
import { friendIdsOf } from "../lib/friends.js";
import { dialCodeOf, hashPhone, normalizePhone, phoneHint } from "../lib/phone.js";
import { emitToUser } from "../lib/socket.js";
import {
  newInviteCode,
  normalizeUsername,
  uniqueUsername,
  usernameBase,
  usernameProblem,
} from "../lib/username.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isTaken = (username) => User.exists({ username });

// An IANA zone the runtime recognises, e.g. "Asia/Kolkata"; anything else falls back to UTC.
const validTimezone = (zone) => {
  try {
    if (typeof zone !== "string" || !zone) return null;
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
};

export const signup = async (req, res) => {
  const fullName = String(req.body.fullName ?? "").trim();
  const email = String(req.body.email ?? "").trim().toLowerCase();
  const password = String(req.body.password ?? "");
  const requested = normalizeUsername(req.body.username);

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    if (fullName.length > 60) return res.status(400).json({ message: "Keep your name under 60 characters." });
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }
    if (!EMAIL.test(email)) return res.status(400).json({ message: "That email doesn't look right." });

    if (await User.exists({ email })) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    let username;
    if (requested) {
      const problem = usernameProblem(requested);
      if (problem) return res.status(400).json({ message: problem });
      if (await isTaken(requested)) return res.status(400).json({ message: "That username is taken." });
      username = requested;
    } else {
      username = await uniqueUsername(usernameBase(fullName, email), isTaken);
    }

    const salt = await bcrypt.genSalt(10);
    const user = await User.create({
      fullName,
      email,
      username,
      inviteCode: newInviteCode(),
      password: await bcrypt.hash(password, salt),
      timezone: validTimezone(req.body.timezone) ?? "UTC",
    });
    generateToken(user._id, res);
    res.status(201).json(selfUser(user));

    try {
      await sendWelcomeEmail(user.email, user.fullName, ENV.CLIENT_ORIGINS[0]);
    } catch (error) {
      console.error("Failed to send welcome email:", error);
    }
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "That email or username was just taken. Try another." });
    }
    console.log("Error in signup controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Accepts an email or a username, so people can sign in with either.
export const login = async (req, res) => {
  const identifier = String(req.body.identifier ?? req.body.email ?? "").trim();
  const password = String(req.body.password ?? "");

  if (!identifier || !password) {
    return res.status(400).json({ message: "Enter your email or username, and your password." });
  }

  try {
    // "@ravi" is a username; only a full address is an email.
    const query = EMAIL.test(identifier)
      ? { email: identifier.toLowerCase() }
      : { username: normalizeUsername(identifier) };
    const user = await User.findOne(query);
    // Never say which of the two was wrong.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const timezone = validTimezone(req.body.timezone);
    if (timezone && timezone !== user.timezone) {
      user.timezone = timezone;
      await user.save();
    }

    generateToken(user._id, res);
    res.status(200).json(selfUser(user));
  } catch (error) {
    console.error("Error in login controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const logout = (_, res) => {
  res.clearCookie("jwt", authCookieOptions());
  res.status(200).json({ message: "Logged out successfully" });
};

export const me = (req, res) => res.status(200).json(selfUser(req.user));

export const socketToken = (req, res) => res.status(200).json({ token: createSocketToken(req.user._id) });

export const usernameAvailability = async (req, res) => {
  const username = normalizeUsername(req.params.username);
  const problem = usernameProblem(username);
  if (problem) return res.status(200).json({ username, available: false, problem });
  try {
    const available = !(await isTaken(username));
    res.status(200).json({ username, available, problem: available ? null : "That username is taken." });
  } catch (error) {
    console.log("Error in usernameAvailability:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Any of name, username, photo (a data URL) and timezone; only the fields sent change.
export const updateProfile = async (req, res) => {
  try {
    const user = req.user;
    const { fullName, username, profilePic, timezone, phone, discoverableByPhone } = req.body;

    if (fullName !== undefined) {
      const name = String(fullName).trim();
      if (!name || name.length > 60) return res.status(400).json({ message: "Names are 1 to 60 characters." });
      user.fullName = name;
    }
    if (username !== undefined) {
      const next = normalizeUsername(username);
      if (next !== user.username) {
        const problem = usernameProblem(next);
        if (problem) return res.status(400).json({ message: problem });
        if (await isTaken(next)) return res.status(400).json({ message: "That username is taken." });
        user.username = next;
      }
    }
    if (timezone !== undefined) user.timezone = validTimezone(timezone) ?? user.timezone;
    if (phone !== undefined) {
      if (phone === "" || phone === null) {
        user.phoneHash = undefined;
        user.phoneHint = undefined;
        user.phoneDialCode = undefined;
      } else {
        const e164 = normalizePhone(phone, "91");
        if (!e164) return res.status(400).json({ message: "That phone number doesn't look right. Include the country code, e.g. +91." });
        user.phoneHash = hashPhone(e164);
        user.phoneHint = phoneHint(e164);
        user.phoneDialCode = dialCodeOf(e164);
      }
    }
    if (discoverableByPhone !== undefined) user.discoverableByPhone = Boolean(discoverableByPhone);
    if (profilePic !== undefined) {
      if (typeof profilePic !== "string" || !profilePic.startsWith("data:image/")) {
        return res.status(400).json({ message: "Choose an image file." });
      }
      user.profilePic = await uploadImage(profilePic, {
        transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
      });
    }

    await user.save();
    res.status(200).json(selfUser(user));

    // Friends see the new name or photo on their board right away.
    const friends = await friendIdsOf(user._id);
    for (const friendId of friends) emitToUser(friendId, "friend:updated", publicUser(user));
  } catch (error) {
    if (error instanceof UploadError) return res.status(error.status).json({ message: error.message });
    if (error?.code === 11000) return res.status(400).json({ message: "That username is taken." });
    console.log("Error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
