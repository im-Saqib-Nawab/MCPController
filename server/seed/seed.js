import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { OAuthClient } from '../models/OAuthClient.js';
import { Doctor } from '../models/Doctor.js';
import { config } from '../config/env.js';
import { ensureAdminUser } from '../services/auth.service.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });

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

  const doctorCount = await Doctor.countDocuments();
  if (doctorCount === 0) {
    await Doctor.create([
      {
        name: 'Dr. Smith',
        specialization: 'Cardiology',
        email: 'smith@clinic.example',
        phone: '+1-555-0101',
        availability: 'Mon–Fri 9am–5pm'
      },
      {
        name: 'Dr. Ali',
        specialization: 'Neurology',
        email: 'ali@clinic.example',
        phone: '+1-555-0102',
        availability: 'Tue–Thu 10am–4pm'
      },
      {
        name: 'Dr. Sarah',
        specialization: 'Dermatology',
        email: 'sarah@clinic.example',
        phone: '+1-555-0103',
        availability: 'Mon, Wed, Fri 8am–2pm'
      }
    ]);
    console.log('Created sample doctors');
  }

  await disconnectDatabase();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
