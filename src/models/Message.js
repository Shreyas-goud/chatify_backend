import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // A message goes either to one friend (receiverId) or to a Glass circle (circleId).
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return !this.circleId;
      },
    },
    circleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Circle",
    },
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    image: {
      type: String,
    },
    // Set when the receiver opens the chat; drives "SEEN" and unread counts.
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Serves both directions of a conversation, newest first.
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ circleId: 1, createdAt: -1 }, { sparse: true });
// Serves unread counts.
messageSchema.index({ receiverId: 1, readAt: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
