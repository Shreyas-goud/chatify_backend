import mongoose from "mongoose";

// One document per pair of people. `a` always holds the smaller id and `b` the larger, so a pair
// has exactly one document whoever asked first (see pairOf in lib/friends.js).
const friendshipSchema = new mongoose.Schema(
  {
    a: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    b: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted"], required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    acceptedAt: { type: Date },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

friendshipSchema.index({ a: 1, b: 1 }, { unique: true });
friendshipSchema.index({ b: 1 });

const Friendship = mongoose.model("Friendship", friendshipSchema);

export default Friendship;
