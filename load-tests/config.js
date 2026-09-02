import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

export const config = {
  rootDir: root,
  baseUrl: (process.env.LOAD_TEST_URL || process.env.API_URL || 'http://127.0.0.1:3000').replace(/\/$/, ''),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',
  cookieName: 'mcpcontroller_session',
  medicineFeatureKey: 'medicine_health_tips',
  personas: {
    admin: {
      role: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: process.env.ADMIN_PASSWORD || 'change-this-password'
    },
    doctors: [
      { email: 'ahmed@clinic.example', password: 'Doctor123!', name: 'Dr. Ahmed Khan' },
      { email: 'ali@clinic.example', password: 'Doctor123!', name: 'Dr. Ali' },
      { email: 'sarah@clinic.example', password: 'Doctor123!', name: 'Dr. Sarah' }
    ],
    patients: [
      { email: 'patient.a@example.com', password: 'Patient123!', name: 'Patient A' },
      { email: 'patient.b@example.com', password: 'Patient123!', name: 'Patient B' }
    ]
  },
  vuLevels: [10, 50, 100, 500],
  thresholds: {
    errorRateMax: 5,
    p95LatencyMs: 2000,
    p99LatencyMs: 5000
  },
  plans: {
    load: { vu: 50, durationSec: 120, rampUpSec: 30 },
    stress: { vuStart: 10, vuMax: 500, stepVu: 50, stepDurationSec: 60 },
    spike: { baselineVu: 10, spikeVu: 200, baselineSec: 30, spikeSec: 20, recoverySec: 30 },
    soak: { vu: 30, durationSec: 1800, rampUpSec: 60 }
  }
};
