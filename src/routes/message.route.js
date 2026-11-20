import express from "express";
import { getMessages, markRead, sendMessage } from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetUserProtection } from "../middleware/arcjet.middleware.js";

const router = express.Router();

// Signed in first, so the rate limit can count per account.
router.use(protectRoute, arcjetUserProtection);

router.get("/:userId", getMessages);
router.post("/:userId", sendMessage);
router.post("/:userId/read", markRead);

export default router;
