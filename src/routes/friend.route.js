import express from "express";
import {
  acceptFriend,
  acceptInvite,
  invitePreview,
  listFriends,
  matchContacts,
  removeFriend,
  requestFriend,
  searchUsers,
} from "../controllers/friend.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection, arcjetUserProtection } from "../middleware/arcjet.middleware.js";

const router = express.Router();

// Public, so an invite link can show who sent it before the visitor has an account.
router.get("/invite/:code", arcjetProtection, invitePreview);

router.use(protectRoute, arcjetUserProtection);

router.get("/", listFriends);
router.get("/search", searchUsers);
router.post("/match", matchContacts);
router.post("/request", requestFriend);
router.post("/invite/:code", acceptInvite);
router.post("/:userId/accept", acceptFriend);
router.delete("/:userId", removeFriend);

export default router;
