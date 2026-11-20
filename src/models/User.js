import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    // The public handle friends find you by (@ravi). Rules live in lib/username.js.
    username: {
      type: String,
      unique: true,
      sparse: true, // accounts made before usernames get one from the startup backfill
      lowercase: true,
      trim: true,
    },
    // Anyone opening /i/<inviteCode> becomes your friend in one tap.
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    profilePic: {
      type: String,
      default: "",
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    // Optional phone number, kept only as a SHA-256 of its E.164 form (for "who's on Chatify" from
    // contacts) plus a masked hint to show its owner. See lib/phone.js.
    phoneHash: { type: String, index: true, sparse: true },
    phoneHint: { type: String },
    phoneDialCode: { type: String }, // e.g. "91": the default for contacts saved without one
    discoverableByPhone: { type: Boolean, default: true },
    // Web Push endpoints, one per browser or installed app (at most five, newest kept).
    pushSubscriptions: [
      {
        _id: false,
        endpoint: { type: String, required: true },
        keys: { p256dh: String, auth: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Last moment Chatify was on screen; Glass circles show it to members.
    lastActiveAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret) => {
        delete ret.password;
        delete ret.__v;
        delete ret.pushSubscriptions;
        delete ret.phoneHash;
        return ret;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;
