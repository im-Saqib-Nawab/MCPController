import { config } from '../config.js';
import { HttpClient } from './http-client.js';

function pick(list, index) {
  return list[index % list.length];
}

const DEFAULT_DISTRIBUTION = { admin: 10, doctor: 50, patient: 40 };

export function normalizeRoleDistribution(input = {}) {
  const admin = Math.max(0, Number(input.admin) || 0);
  const doctor = Math.max(0, Number(input.doctor) || 0);
  const patient = Math.max(0, Number(input.patient) || 0);
  const total = admin + doctor + patient;
  if (total <= 0) return { ...DEFAULT_DISTRIBUTION };
  return {
    admin: Math.round((admin / total) * 100),
    doctor: Math.round((doctor / total) * 100),
    patient: Math.max(0, 100 - Math.round((admin / total) * 100) - Math.round((doctor / total) * 100))
  };
}

export function personaForVu(vuIndex, distribution = DEFAULT_DISTRIBUTION) {
  const slots = Math.max(1, distribution.admin + distribution.doctor + distribution.patient);
  const slot = vuIndex % slots;

  if (slot < distribution.admin) {
    return { role: 'admin', credentials: config.personas.admin };
  }

  if (slot < distribution.admin + distribution.doctor) {
    const doctor = pick(config.personas.doctors, vuIndex);
    return { role: 'doctor', credentials: doctor };
  }

  const patient = pick(config.personas.patients, vuIndex);
  return { role: 'patient', credentials: patient };
}

export async function createAuthenticatedClient(vuIndex, options = {}) {
  const distribution = normalizeRoleDistribution(options.roleDistribution);
  const persona = personaForVu(vuIndex, distribution);
  const client = new HttpClient(options.baseUrl);
  const login = await client.login(persona.credentials.email, persona.credentials.password);

  if (!login.ok) {
    throw new Error(`Login failed for ${persona.role} (${persona.credentials.email}): HTTP ${login.status}`);
  }

  const me = await client.me();
  return { client, persona, user: me.data?.user || null };
}
