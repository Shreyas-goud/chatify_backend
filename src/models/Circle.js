import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

// A member's attention cursors. Each holds the latest time it happened, which is all that's needed
// to tell everyone what became of the newest message (see attention.js on the frontend).
const memberSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true },
    // Invited people see the circle's name and members, nothing else, until they agree to Glass.
    status: { type: String, enum: ["invited", "joined"], required: true },
    invitedBy: { type: ObjectId, ref: "User" },
    joinedAt: { type: Date },
    deliveredAt: { type: Date }, // reached their device: a live socket, or a push that arrived
    notifiedAt: { type: Date }, // a notification was shown
    dismissedAt: { type: Date }, // they swiped the notification away
    readAt: { type: Date }, // they opened the circle
  },
  { _id: false }
);

// A Glass circle: a private group of friends who all agreed to full transparency.
const circleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    createdBy: { type: ObjectId, ref: "User", required: true },
    members: { type: [memberSchema], default: [] },
    lastMessageAt: { type: Date },
  },
  { timestamps: true }
);

circleSchema.index({ "members.userId": 1 });

const Circle = mongoose.model("Circle", circleSchema);

export default Circle;
