import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Represents the single Admin resource owner for OAuth (codes, tokens, connections).
 * Login credentials themselves come from ADMIN_EMAIL / ADMIN_PASSWORD in .env —
 * this collection is not a multi-user account registry.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    // bcrypt hash only — the plain password is never persisted.
    password: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPasswordIfNeeded() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

export const User = mongoose.model('User', userSchema);
