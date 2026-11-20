import webpush from "web-push";
import { ENV } from "./env.js";
import User from "../models/User.js";

const enabled = Boolean(ENV.VAPID_PUBLIC_KEY && ENV.VAPID_PRIVATE_KEY);

// The subject identifies the sender to push services: a mailto: or https: URL.
const subject =
  ENV.VAPID_SUBJECT || ENV.CLIENT_ORIGINS.find((origin) => origin.startsWith("https://")) || "https://chatify.app";

if (enabled) webpush.setVapidDetails(subject, ENV.VAPID_PUBLIC_KEY, ENV.VAPID_PRIVATE_KEY);

export const pushEnabled = () => enabled;
export const vapidPublicKey = () => (enabled ? ENV.VAPID_PUBLIC_KEY : null);

// Sends to every browser the person turned notifications on in. Endpoints the push service says
// are gone (404/410) are removed. Returns how many were accepted.
export async function pushTo(userId, payload, { urgency = "normal", ttl = 6 * 60 * 60 } = {}) {
  if (!enabled) return 0;
  const user = await User.findById(userId, { pushSubscriptions: 1 }).lean();
  const subscriptions = user?.pushSubscriptions ?? [];
  const gone = [];
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: ttl, urgency });
        sent += 1;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) gone.push(subscription.endpoint);
        else console.log("Push failed:", error.statusCode ?? error.message);
      }
    })
  );
  if (gone.length) {
    await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: gone } } } });
  }
  return sent;
}
