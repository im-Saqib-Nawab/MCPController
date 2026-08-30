import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { OAuthClient } from '../models/OAuthClient.js';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { ensureAdminUser } from '../services/auth.service.js';
import { defaultWeeklyAvailability, summarizeAvailability } from '../lib/availability.js';
import { defaultScopesForRole } from '../services/permission.service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });

async function upsertDoctorAccount({ name, email, password, specialization, phone, weeklyAvailability }) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      password,
      role: 'doctor',
      phone,
      allowedScopes: defaultScopesForRole('doctor')
    });
  }

  const schedule = weeklyAvailability || defaultWeeklyAvailability();
  await Doctor.findOneAndUpdate(
    { userId: user._id },
    {
      userId: user._id,
      name,
      specialization,
      email,
      phone,
      weeklyAvailability: schedule,
      availability: summarizeAvailability(schedule)
    },
    { upsert: true }
  );
}

async function upsertPatientAccount({ name, email, password, phone, age, gender }) {
  const existing = await User.findOne({ email });
  if (existing) return;
  await User.create({
    name,
    email,
    password,
    role: 'patient',
    phone,
    age,
    gender,
    allowedScopes: defaultScopesForRole('patient')
  });
}

async function seed() {
  await connectDatabase();

  const admin = await ensureAdminUser();
  console.log(`Admin ready: ${admin.email}`);

  const inspectorRedirects = [
    'http://localhost:6274/callback',
    'http://127.0.0.1:6274/callback',
    'http://localhost:6274/oauth/callback',
    'http://127.0.0.1:6274/oauth/callback',
    `${config.appUrl}/oauth/success`,
    `${config.apiUrl}/oauth/success`
  ];

  await OAuthClient.findOneAndUpdate(
    { clientId: 'mcp-inspector' },
    {
      clientId: 'mcp-inspector',
      clientName: 'MCP Inspector',
      redirectUris: inspectorRedirects,
      allowedScopes: [...config.scopes],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token']
    },
    { upsert: true }
  );
  console.log('Upserted OAuth client mcp-inspector');

  await upsertDoctorAccount({
    name: 'Dr. Ahmed Khan',
    email: 'ahmed@clinic.example',
    password: 'Doctor123!',
    specialization: 'Cardiology',
    phone: '+1-555-0101',
    weeklyAvailability: {
      monday: 'available',
      tuesday: 'available',
      wednesday: 'unavailable',
      thursday: 'available',
      friday: 'available',
      saturday: 'unavailable',
      sunday: 'unavailable'
    }
  });

  await upsertDoctorAccount({
    name: 'Dr. Ali',
    email: 'ali@clinic.example',
    password: 'Doctor123!',
    specialization: 'Neurology',
    phone: '+1-555-0102'
  });

  await upsertDoctorAccount({
    name: 'Dr. Sarah',
    email: 'sarah@clinic.example',
    password: 'Doctor123!',
    specialization: 'Dermatology',
    phone: '+1-555-0103',
    weeklyAvailability: {
      monday: 'available',
      tuesday: 'unavailable',
      wednesday: 'available',
      thursday: 'unavailable',
      friday: 'available',
      saturday: 'unavailable',
      sunday: 'unavailable'
    }
  });

  await upsertPatientAccount({
    name: 'Patient A',
    email: 'patient.a@example.com',
    password: 'Patient123!',
    phone: '+1-555-0201',
    age: 34,
    gender: 'female'
  });

  await upsertPatientAccount({
    name: 'Patient B',
    email: 'patient.b@example.com',
    password: 'Patient123!',
    phone: '+1-555-0202',
    age: 41,
    gender: 'male'
  });

  console.log('Sample doctors and patients are ready.');
  await disconnectDatabase();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
