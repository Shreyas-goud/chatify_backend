import express from "express";
import {
  login,
  logout,
  me,
  signup,
  socketToken,
  updateProfile,
  usernameAvailability,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { arcjetProtection, arcjetUserProtection } from "../middleware/arcjet.middleware.js";

const router = express.Router();

router.post("/signup", arcjetProtection, signup);
router.post("/login", arcjetProtection, login);
router.post("/logout", logout);
router.get("/username/:username", arcjetProtection, usernameAvailability);

router.get("/check", protectRoute, arcjetUserProtection, me);
router.get("/socket-token", protectRoute, arcjetUserProtection, socketToken);
router.put("/update-profile", protectRoute, arcjetUserProtection, updateProfile);

export default router;
