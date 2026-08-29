import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';

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
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'user'],
      default: 'user'
    },
    allowedScopes: {
      type: [String],
      default: () => ['doctor:read']
    }
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

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    allowedScopes: [...this.allowedScopes],
    createdAt: this.createdAt
  };
};

export function normalizeAllowedScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return [...new Set(scopes.filter((scope) => config.scopes.includes(scope)))];
}

export const User = mongoose.model('User', userSchema);
