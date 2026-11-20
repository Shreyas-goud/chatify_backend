import User from "../models/User.js";
import { verifyToken } from "../lib/utils.js";

export const protectRoute = async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) return res.status(401).json({ message: "Please sign in." });

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    // Expired or tampered: the browser should sign in again, not see a server error.
    return res.status(401).json({ message: "Your session ended. Please sign in again." });
  }
  if (decoded.purpose) return res.status(401).json({ message: "Please sign in." });

  try {
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) return res.status(401).json({ message: "Please sign in." });
    req.user = user;
    next();
  } catch (error) {
    console.log("Error in protectRoute middleware:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
