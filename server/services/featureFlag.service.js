import mongoose from 'mongoose';
import { FeatureFlag } from '../models/FeatureFlag.js';
import { Doctor } from '../models/Doctor.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, isDoctor, isPatient } from '../lib/roles.js';
import {
  DOCTOR_ACCESS_MODES,
  FEATURE_FLAG_DEFAULTS,
  MEDICINE_FEATURE_KEY
} from '../lib/medicines.js';
import { isDoctorInPercentage } from '../lib/rollout.js';
import { config } from '../config/env.js';

const flagCache = new Map();

async function readCachedFlag(key) {
  if (config.isTest) {
    let flag = await FeatureFlag.findOne({ key });
    if (!flag) {
      try {
        flag = await FeatureFlag.create({
          ...FEATURE_FLAG_DEFAULTS,
          key,
          name: key === MEDICINE_FEATURE_KEY ? FEATURE_FLAG_DEFAULTS.name : key,
          description: key === MEDICINE_FEATURE_KEY ? FEATURE_FLAG_DEFAULTS.description : ''
        });
      } catch (err) {
        if (err?.code !== 11000) {
          throw err;
        }
        flag = await FeatureFlag.findOne({ key });
        if (!flag) {
          throw err;
        }
      }
    }
    return flag;
  }

  const cached = flagCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.flag;
  }

  let flag = await FeatureFlag.findOne({ key });
  if (!flag) {
    try {
      flag = await FeatureFlag.create({
        ...FEATURE_FLAG_DEFAULTS,
        key,
        name: key === MEDICINE_FEATURE_KEY ? FEATURE_FLAG_DEFAULTS.name : key,
        description: key === MEDICINE_FEATURE_KEY ? FEATURE_FLAG_DEFAULTS.description : ''
      });
    } catch (err) {
      if (err?.code !== 11000) {
        throw err;
      }
      flag = await FeatureFlag.findOne({ key });
      if (!flag) {
        throw err;
      }
    }
  }

  flagCache.set(key, {
    flag,
    expiresAt: Date.now() + config.featureFlagCacheTtlMs
  });
  return flag;
}

function bustFlagCache(key = MEDICINE_FEATURE_KEY) {
  flagCache.delete(key);
}

export function serializeFlag(flag) {
  return {
    key: flag.key,
    name: flag.name,
    description: flag.description || '',
    enabled: Boolean(flag.enabled),
    doctorAccess: flag.doctorAccess || 'all',
    doctorIds: (flag.doctorIds || []).map((id) => String(id)),
    percentage: Number(flag.percentage) || 0,
    patientsEnabled: Boolean(flag.patientsEnabled),
    updatedAt: flag.updatedAt
  };
}

export async function getOrCreateFlag(key = MEDICINE_FEATURE_KEY) {
  return readCachedFlag(key);
}

export function isDoctorIncluded(flag, doctorId) {
  if (!flag?.enabled || !doctorId) return false;

  const id = String(doctorId);
  if (flag.doctorAccess === 'all') return true;
  if (flag.doctorAccess === 'specific') {
    return (flag.doctorIds || []).some((value) => String(value) === id);
  }
  if (flag.doctorAccess === 'percentage') {
    return isDoctorInPercentage(flag.key, id, flag.percentage);
  }
  return false;
}

export async function listAllowedDoctorIds(flag) {
  if (!flag?.enabled) return [];

  if (flag.doctorAccess === 'specific') {
    return (flag.doctorIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  }

  const doctors = await Doctor.find().select('_id').lean();
  if (flag.doctorAccess === 'all') {
    return doctors.map((doctor) => doctor._id);
  }

  return doctors.filter((doctor) => isDoctorIncluded(flag, doctor._id)).map((doctor) => doctor._id);
}

async function doctorRecordForUser(actor) {
  if (!actor) return null;
  const userId = actor._id || actor.id;
  if (!userId) return null;
  return Doctor.findOne({ userId }).lean();
}

export async function getMedicineFeatureAccess(actor, { doctorRecord = null } = {}) {
  const flag = await getOrCreateFlag(MEDICINE_FEATURE_KEY);
  const serialized = serializeFlag(flag);

  if (isAdmin(actor)) {
    return { ...serialized, canView: true, canManage: true };
  }

  if (!flag.enabled) {
    return { ...serialized, canView: false, canManage: false };
  }

  if (isDoctor(actor)) {
    const doctor = doctorRecord ?? await doctorRecordForUser(actor);
    const allowed = Boolean(doctor && isDoctorIncluded(flag, doctor._id));
    return { ...serialized, canView: allowed, canManage: allowed, doctorId: doctor ? String(doctor._id) : null };
  }

  if (isPatient(actor)) {
    return { ...serialized, canView: Boolean(flag.patientsEnabled), canManage: false };
  }

  return { ...serialized, canView: false, canManage: false };
}

export async function featuresForUser(actor, { doctorRecord = null } = {}) {
  return {
    [MEDICINE_FEATURE_KEY]: await getMedicineFeatureAccess(actor, { doctorRecord })
  };
}

export async function assertCanViewMedicines(actor) {
  const access = await getMedicineFeatureAccess(actor);
  if (!access.canView) {
    throw new AppError(
      403,
      'feature_disabled',
      'Medicine & Health Tips is not available for your account.'
    );
  }
  return access;
}

export async function assertCanManageMedicines(actor) {
  const access = await getMedicineFeatureAccess(actor);
  if (!access.canManage) {
    throw new AppError(
      403,
      'feature_disabled',
      'You are not allowed to manage medicines.'
    );
  }
  return access;
}

export async function listFeatureFlags() {
  const flag = await getOrCreateFlag(MEDICINE_FEATURE_KEY);
  return [await serializeFlagForAdmin(flag)];
}

export async function getFeatureFlag(key) {
  if (key !== MEDICINE_FEATURE_KEY) {
    throw new AppError(404, 'not_found', 'Feature flag not found.');
  }
  const flag = await getOrCreateFlag(key);
  return serializeFlagForAdmin(flag);
}

export async function serializeFlagForAdmin(flag) {
  const doctors = await Doctor.find().select('_id name specialization').sort({ name: 1 }).lean();
  const included = doctors.filter((doctor) => isDoctorIncluded(flag, doctor._id));
  return {
    ...serializeFlag(flag),
    includedDoctorIds: included.map((doctor) => String(doctor._id)),
    includedDoctors: included.map((doctor) => ({
      id: String(doctor._id),
      name: doctor.name,
      specialization: doctor.specialization
    })),
    includedDoctorCount: included.length,
    totalDoctorCount: doctors.length
  };
}

function normalizeDoctorIds(doctorIds) {
  if (!Array.isArray(doctorIds)) return [];
  const unique = [...new Set(doctorIds.map((id) => String(id)).filter((id) => mongoose.isValidObjectId(id)))];
  return unique.map((id) => new mongoose.Types.ObjectId(id));
}

export async function updateFeatureFlag(key, fields, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only an administrator can manage feature flags.');
  }
  if (key !== MEDICINE_FEATURE_KEY) {
    throw new AppError(404, 'not_found', 'Feature flag not found.');
  }

  const flag = await getOrCreateFlag(key);

  if (fields.enabled !== undefined) {
    flag.enabled = Boolean(fields.enabled);
  }

  if (fields.doctorAccess !== undefined) {
    if (!DOCTOR_ACCESS_MODES.includes(fields.doctorAccess)) {
      throw new AppError(400, 'invalid_request', 'doctorAccess must be all, specific, or percentage.');
    }
    flag.doctorAccess = fields.doctorAccess;
  }

  if (fields.doctorIds !== undefined) {
    const ids = normalizeDoctorIds(fields.doctorIds);
    if (ids.length) {
      const found = await Doctor.countDocuments({ _id: { $in: ids } });
      if (found !== ids.length) {
        throw new AppError(400, 'invalid_request', 'One or more selected doctors were not found.');
      }
    }
    flag.doctorIds = ids;
  }

  if (fields.percentage !== undefined) {
    const percentage = Number(fields.percentage);
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      throw new AppError(400, 'invalid_request', 'percentage must be an integer between 0 and 100.');
    }
    flag.percentage = percentage;
  }

  if (fields.patientsEnabled !== undefined) {
    flag.patientsEnabled = Boolean(fields.patientsEnabled);
  }

  await flag.save();
  bustFlagCache(key);
  return serializeFlagForAdmin(flag);
}
