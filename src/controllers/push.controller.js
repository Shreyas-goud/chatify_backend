import User from "../models/User.js";
import { pushEnabled, vapidPublicKey } from "../lib/push.js";

const MAX_SUBSCRIPTIONS = 5;

export const pushKey = (_, res) => res.status(200).json({ enabled: pushEnabled(), publicKey: vapidPublicKey() });

const validSubscription = (sub) =>
  sub &&
  typeof sub.endpoint === "string" &&
  sub.endpoint.startsWith("https://") &&
  sub.endpoint.length < 1000 &&
  typeof sub.keys?.p256dh === "string" &&
  typeof sub.keys?.auth === "string";

// Keeps the newest five browsers per person; re-subscribing the same browser replaces its entry.
export const subscribe = async (req, res) => {
  const subscription = req.body?.subscription;
  if (!validSubscription(subscription)) return res.status(400).json({ message: "Bad push subscription." });
  try {
    const entry = { endpoint: subscription.endpoint, keys: subscription.keys, createdAt: new Date() };
    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint: entry.endpoint } } });
    await User.updateOne(
      { _id: req.user._id },
      { $push: { pushSubscriptions: { $each: [entry], $slice: -MAX_SUBSCRIPTIONS } } }
    );
    res.status(200).json({ subscribed: true });
  } catch (error) {
    console.log("Error in push subscribe:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const unsubscribe = async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint ?? "");
    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint } } });
    res.status(200).json({ subscribed: false });
  } catch (error) {
    console.log("Error in push unsubscribe:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
