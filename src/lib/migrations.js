import User from "../models/User.js";
import { newInviteCode, uniqueUsername, usernameBase } from "./username.js";

// Brings accounts made before v2 up to date: a username, an invite code, a lower-case email.
// Safe to run on every start; it only touches accounts that need it.
export async function backfillAccounts() {
  const users = await User.find({
    $or: [{ username: { $exists: false } }, { inviteCode: { $exists: false } }, { email: /[A-Z]/ }],
  });
  for (const user of users) {
    if (!user.username) {
      user.username = await uniqueUsername(usernameBase(user.fullName, user.email), (u) =>
        User.exists({ username: u })
      );
    }
    if (!user.inviteCode) user.inviteCode = newInviteCode();
    user.email = user.email.toLowerCase();
    await user.save();
  }
  if (users.length) console.log(`Backfilled ${users.length} account(s) for v2`);
}
