import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { OAuthClient } from '../models/OAuthClient.js';
import { DataItem } from '../models/DataItem.js';
import { config } from '../config/env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env') });

async function seed() {
  await connectDatabase();

  const email = 'test@example.com';
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name: 'Test User',
      email,
      password: 'password123'
    });
    console.log('Created demo user test@example.com');
  } else {
    console.log('Demo user already exists');
  }

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
      allowedScopes: ['read', 'write', 'delete'],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token']
    },
    { upsert: true }
  );
  console.log('Upserted OAuth client mcp-inspector');

  const count = await DataItem.countDocuments({ userId: user._id });
  if (count === 0) {
    await DataItem.create([
      { userId: user._id, title: 'Welcome note', content: 'This record was created by npm run seed.' },
      { userId: user._id, title: 'Practice item', content: 'Try get_data, update_data, and delete_data from ChatGPT.' }
    ]);
    console.log('Created sample data items');
  }

  await disconnectDatabase();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
