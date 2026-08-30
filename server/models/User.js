import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { publicRole } from '../lib/roles.js';

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
      enum: ['admin', 'user', 'doctor', 'patient'],
      default: 'patient'
    },
    phone: { type: String, trim: true, default: '' },
    age: { type: Number, min: 0, max: 130, default: null },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: ''
    },
    bio: { type: String, trim: true, default: '' },
    allowedScopes: {
      type: [String],
      default: () => ['doctor:read', 'availability:read', 'appointment:read', 'appointment:create', 'appointment:update', 'profile:read', 'profile:update']
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
    role: publicRole(this),
    phone: this.phone || '',
    age: this.age ?? null,
    gender: this.gender || '',
    bio: this.bio || '',
    allowedScopes: [...this.allowedScopes],
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export function normalizeAllowedScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return [...new Set(scopes.filter((scope) => config.scopes.includes(scope)))];
}

export const User = mongoose.model('User', userSchema);
