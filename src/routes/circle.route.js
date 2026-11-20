import express from "express";
import {
  answerNudge,
  attentionReceipt,
  createCircle,
  getCircleMessages,
  joinCircle,
  leaveCircle,
  listCircles,
  nudgeMember,
  readCircle,
  sendCircleMessage,
} from "../controllers/circle.controller.js";
import { pushKey, subscribe, unsubscribe } from "../controllers/push.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetUserProtection } from "../middleware/arcjet.middleware.js";

// Glass circles, nudges, notification receipts and push subscriptions.
export const circleRoutes = express.Router();
circleRoutes.use(protectRoute, arcjetUserProtection);
circleRoutes.get("/", listCircles);
circleRoutes.post("/", createCircle);
circleRoutes.post("/:id/join", joinCircle);
circleRoutes.delete("/:id/membership", leaveCircle);
circleRoutes.get("/:id/messages", getCircleMessages);
circleRoutes.post("/:id/messages", sendCircleMessage);
circleRoutes.post("/:id/read", readCircle);
circleRoutes.post("/:id/nudges/:userId", nudgeMember);

export const nudgeRoutes = express.Router();
nudgeRoutes.use(protectRoute, arcjetUserProtection);
nudgeRoutes.post("/:id/outcome", answerNudge);

// Called by the service worker, which carries the same first-party cookie.
export const attentionRoutes = express.Router();
attentionRoutes.use(protectRoute);
attentionRoutes.post("/", attentionReceipt);

export const pushRoutes = express.Router();
pushRoutes.get("/key", pushKey);
pushRoutes.post("/subscribe", protectRoute, subscribe);
pushRoutes.post("/unsubscribe", protectRoute, unsubscribe);
