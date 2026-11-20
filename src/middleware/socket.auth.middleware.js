import User from "../models/User.js";
import { verifyToken } from "../lib/utils.js";

const cookieToken = (cookieHeader) =>
  cookieHeader
    ?.split("; ")
    .find((row) => row.startsWith("jwt="))
    ?.slice(4);

export const socketAuthMiddleware = async (socket, next) => {
  try {
    const handshakeToken = socket.handshake.auth?.token;
    let userId;
    if (handshakeToken) {
      const decoded = verifyToken(handshakeToken);
      if (decoded.purpose !== "socket") throw new Error("wrong token purpose");
      userId = decoded.userId;
    } else {
      // Same-site setups (e.g. one custom domain) can still use the session cookie.
      const token = cookieToken(socket.handshake.headers.cookie);
      if (!token) return next(new Error("Unauthorized"));
      userId = verifyToken(token).userId;
    }

    const user = await User.findById(userId).select("_id fullName");
    if (!user) return next(new Error("Unauthorized"));

    socket.user = user;
    socket.userId = String(user._id);
    next();
  } catch (error) {
    console.log("Socket authentication failed:", error.message);
    next(new Error("Unauthorized"));
  }
};
