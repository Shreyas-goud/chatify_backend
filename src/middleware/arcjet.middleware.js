import { isSpoofedBot } from "@arcjet/inspect";
import { ajPublic, ajUser } from "../lib/arcjet.js";

const protectWith = (client, extra) => async (req, res, next) => {
  try {
    const decision = await client.protect(req, extra(req));

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return res.status(429).json({ message: "Too many requests. Wait a moment and try again." });
      }
      if (decision.reason.isBot()) return res.status(403).json({ message: "Bot access denied." });
      return res.status(403).json({ message: "Access denied by security policy." });
    }

    if (decision.results.some(isSpoofedBot)) {
      return res.status(403).json({ message: "Malicious bot activity detected." });
    }

    next();
  } catch (error) {
    // Fail open: an Arcjet outage must not take the app down with it.
    console.log("Arcjet Protection Error:", error);
    next();
  }
};

export const arcjetProtection = protectWith(ajPublic, () => ({}));

// Runs after protectRoute, which sets req.user.
export const arcjetUserProtection = protectWith(ajUser, (req) => ({ userId: String(req.user._id) }));
