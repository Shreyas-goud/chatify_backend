import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import mongoose from "mongoose";

import authRoutes from "./routes/auth.route.js";
import friendRoutes from "./routes/friend.route.js";
import messageRoutes from "./routes/message.route.js";
import { attentionRoutes, circleRoutes, nudgeRoutes, pushRoutes } from "./routes/circle.route.js";
import { connectDB } from "./lib/db.js";
import { backfillAccounts } from "./lib/migrations.js";
import { ENV } from "./lib/env.js";
import { app, server } from "./lib/socket.js";

const PORT = ENV.PORT || 3000;

app.use(express.json({ limit: "5mb" })); // req.body
app.use(cors({ origin: ENV.CLIENT_ORIGINS, credentials: true }));
app.use(cookieParser());

// For Render's health check: 200 only once the database is connected.
app.get("/healthz", (_, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ ok: dbUp });
});

app.use("/api/auth", authRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/circles", circleRoutes);
app.use("/api/nudges", nudgeRoutes);
app.use("/api/attention", attentionRoutes);
app.use("/api/push", pushRoutes);

server.listen(PORT, async () => {
  console.log("Server running on port: " + PORT);
  await connectDB();
  backfillAccounts().catch((error) => console.error("Account backfill failed:", error));
});
