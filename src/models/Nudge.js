import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// "Asha nudged Ravi": a pop-up on Ravi's screen if he's in the app, otherwise a push that stays
// until he acts on it. What he did with it is recorded for the whole circle to see.
const nudgeSchema = new mongoose.Schema(
  {
    circleId: { type: ObjectId, ref: "Circle", required: true },
    from: { type: ObjectId, ref: "User", required: true },
    to: { type: ObjectId, ref: "User", required: true },
    channel: { type: String, enum: ["popup", "push", "none"], required: true },
    outcome: { type: String, enum: ["pending", "opened", "dismissed", "replied"], default: "pending" },
    outcomeAt: { type: Date },
  },
  { timestamps: true }
);

nudgeSchema.index({ circleId: 1, createdAt: -1 });
nudgeSchema.index({ to: 1, outcome: 1 });

const Nudge = mongoose.model("Nudge", nudgeSchema);

export default Nudge;
