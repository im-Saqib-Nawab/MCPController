import jwt from 'jsonwebtoken';
import { User, normalizeAllowedScopes } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, normalizeRole, publicRole, ROLES } from '../lib/roles.js';
import { defaultWeeklyAvailability, summarizeAvailability } from '../lib/availability.js';
import { defaultScopesForRole } from './permission.service.js';
import { revokeUserTokens } from './token.service.js';
import { Connection } from '../models/Connection.js';
import { featuresForUser } from './featureFlag.service.js';
import { paginateQuery } from '../lib/pagination.js';
import { withOptionalTransaction } from '../lib/transactions.js';
import { grantInitialCredits } from './credit.service.js';
import { getActiveSubscription } from './subscription.service.js';

function cookieMaxAgeMs() {
  const value = String(config.jwtExpiresIn || '7d');
  const amount = Number(value.slice(0, -1));
  if (value.endsWith('d') && Number.isFinite(amount)) return amount * 24 * 60 * 60 * 1000;
  if (value.endsWith('h') && Number.isFinite(amount)) return amount * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

export async function bumpSessionVersion(userId) {
  const updated = await User.findByIdAndUpdate(
    userId,
    { $inc: { sessionVersion: 1 } },
    { new: true }
  ).lean();

  return updated?.sessionVersion ?? 0;
}

export function setSessionCookie(res, user, sessionVersion = user.sessionVersion ?? 0) {
  const token = jwt.sign(
    {
      sub: String(user._id || user.id),
      email: user.email,
      role: publicRole(user),
      sv: sessionVersion
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: cookieMaxAgeMs()
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/'
  });
}

export function serializeUser(user, extras = {}) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: publicRole(user),
    phone: user.phone || '',
    age: user.age ?? null,
    gender: user.gender || '',
    bio: user.bio || '',
    allowedScopes: normalizeAllowedScopes(user.allowedScopes),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...extras
  };
}

export async function serializeUserWithProfile(user) {
  const extras = {};
  let doctorRecord = null;
  if (normalizeRole(user.role) === ROLES.DOCTOR) {
    doctorRecord = await Doctor.findOne({ userId: user._id || user.id }).lean();
    extras.doctorId = doctorRecord ? String(doctorRecord._id) : null;
    extras.specialization = doctorRecord?.specialization || '';
    extras.weeklyAvailability = doctorRecord?.weeklyAvailability || defaultWeeklyAvailability();
    extras.availability = doctorRecord?.availability || summarizeAvailability(doctorRecord?.weeklyAvailability);
  }
  extras.features = await featuresForUser(user, { doctorRecord });
  extras.creditBalance = user.creditBalance ?? 0;
  if (!isAdmin(user)) {
    extras.subscription = await getActiveSubscription(user._id || user.id);
  }
  return serializeUser(user, extras);
}

export async function ensureAdminUser() {
  const email = config.adminEmail.toLowerCase().trim();
  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = await User.create({
      name: 'Admin',
      email,
      password: config.adminPassword,
      role: 'admin',
      allowedScopes: [...config.scopes]
    });
  } else {
    user.name = 'Admin';
    user.role = 'admin';
    user.allowedScopes = [...config.scopes];
    await user.save();
  }

  const safe = user.toObject();
  delete safe.password;
  return safe;
}

function parseRegisterRole(role) {
  const normalized = String(role || ROLES.PATIENT).toLowerCase().trim();
  if (normalized === ROLES.DOCTOR || normalized === ROLES.PATIENT) {
    return normalized;
  }
  throw new AppError(400, 'invalid_request', 'Role must be doctor or patient.');
}

export async function registerUser({
  name,
  email,
  password,
  role,
  specialization,
  phone,
  age,
  gender,
  bio
}) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const adminEmail = config.adminEmail.toLowerCase().trim();
  const nextRole = parseRegisterRole(role);

  if (normalizedEmail === adminEmail) {
    throw new AppError(
      409,
      'registration_not_allowed',
      'This email is reserved for the administrator account.'
    );
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(409, 'email_in_use', 'An account with this email already exists.');
  }

  if (nextRole === ROLES.DOCTOR && !String(specialization || '').trim()) {
    throw new AppError(400, 'invalid_request', 'Specialization is required for doctor accounts.');
  }

  const user = await User.create({
    name: String(name || '').trim(),
    email: normalizedEmail,
    password,
    role: nextRole,
    phone: String(phone || '').trim(),
    age: age === undefined || age === null || age === '' ? null : Number(age),
    gender: ['male', 'female', 'other'].includes(String(gender || '')) ? gender : '',
    bio: String(bio || '').trim(),
    allowedScopes: defaultScopesForRole(nextRole)
  });

  if (nextRole === ROLES.DOCTOR) {
    await Doctor.create({
      userId: user._id,
      name: user.name,
      specialization: String(specialization).trim(),
      email: user.email,
      phone: user.phone,
      weeklyAvailability: defaultWeeklyAvailability(),
      availability: summarizeAvailability(defaultWeeklyAvailability())
    });
  }

  await grantInitialCredits(user._id);

  const freshUser = await User.findById(user._id).lean();
  return serializeUserWithProfile(freshUser);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const adminEmail = config.adminEmail.toLowerCase().trim();

  if (normalizedEmail === adminEmail) {
    await ensureAdminUser();
    const admin = await User.findOne({ email: adminEmail }).select('+password');
    if (!admin) {
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const valid = await admin.comparePassword(password);
    if (!valid) {
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
    }

    const sessionVersion = await bumpSessionVersion(admin._id);
    const freshAdmin = await User.findById(admin._id).lean();
    return {
      user: await serializeUserWithProfile(freshAdmin),
      sessionVersion
    };
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  if (user.role === 'user') {
    user.role = ROLES.PATIENT;
    user.allowedScopes = [
      ...new Set([...defaultScopesForRole(ROLES.PATIENT), ...normalizeAllowedScopes(user.allowedScopes)])
    ];
    await user.save();
  }

  const sessionVersion = await bumpSessionVersion(user._id);
  const freshUser = await User.findById(user._id).lean();
  return {
    user: await serializeUserWithProfile(freshUser),
    sessionVersion
  };
}

export async function updateOwnProfile(userId, fields) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }

  for (const key of ['name', 'phone', 'bio']) {
    if (fields[key] !== undefined) {
      user[key] = String(fields[key] || '').trim();
    }
  }

  if (fields.age !== undefined) {
    user.age = fields.age === null || fields.age === '' ? null : Number(fields.age);
  }

  if (fields.gender !== undefined) {
    user.gender = ['male', 'female', 'other', ''].includes(fields.gender) ? fields.gender : user.gender;
  }

  await user.save();

  if (normalizeRole(user.role) === ROLES.DOCTOR) {
    const doctor = await Doctor.findOne({ userId: user._id });
    if (doctor) {
      if (fields.name !== undefined) doctor.name = user.name;
      if (fields.phone !== undefined) doctor.phone = user.phone;
      if (fields.specialization !== undefined && String(fields.specialization).trim()) {
        doctor.specialization = String(fields.specialization).trim();
      }
      await doctor.save();
    }
  }

  return serializeUserWithProfile(user);
}

export async function listUsers(pagination = {}) {
  const { items, pagination: meta } = await paginateQuery(User, {}, {
    sort: { createdAt: -1 },
    pagination
  });
  return {
    users: items.map((user) => serializeUser(user)),
    pagination: meta
  };
}

export async function updateUserPermissions(userId, allowedScopes) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }

  if (user.role === 'admin') {
    throw new AppError(400, 'invalid_request', 'Administrator permissions cannot be changed here.');
  }

  user.allowedScopes = normalizeAllowedScopes(allowedScopes);

  await withOptionalTransaction(async (session) => {
    const options = session ? { session } : undefined;
    await user.save(options);
    await revokeUserTokens(user._id, options);
    await Connection.deleteMany({ userId: user._id }, options);
  });

  return serializeUser(user);
}

export function getEffectiveAllowedScopes(user) {
  if (isAdmin(user)) {
    return [...config.scopes];
  }
  return normalizeAllowedScopes(user.allowedScopes);
}
