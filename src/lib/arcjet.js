import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

import { ENV } from "./env.js";

const guards = () => [
  // Blocks common attacks such as SQL injection.
  shield({ mode: "LIVE" }),
  // Blocks automated clients, except search engines.
  detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE"] }),
];

// Sign-up, login and invite previews: limited per IP address.
export const ajPublic = arcjet({
  key: ENV.ARCJET_KEY,
  rules: [...guards(), slidingWindow({ mode: "LIVE", max: 100, interval: 60 })],
});

// Signed-in routes: limited per account. Requests arrive through the Vercel proxy, where many
// people can share an address, so an IP limit would throttle everyone at once.
export const ajUser = arcjet({
  key: ENV.ARCJET_KEY,
  rules: [
    ...guards(),
    slidingWindow({ mode: "LIVE", characteristics: ["userId"], max: 300, interval: 60 }),
  ],
});
