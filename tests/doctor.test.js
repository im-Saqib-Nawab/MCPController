import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { Doctor } from '../server/models/Doctor.js';
import * as doctorService from '../server/services/doctor.service.js';

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
});

beforeEach(async () => {
  await Doctor.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
});

test('doctor model works', async () => {
  const doctor = await Doctor.create({ name: 'Dr. Smith', specialization: 'Cardiology' });
  assert.equal(doctor.name, 'Dr. Smith');
  assert.equal(doctor.specialization, 'Cardiology');
  assert.ok(doctor.createdAt);
  assert.ok(doctor.updatedAt);
});

test('list doctors works', async () => {
  await Doctor.create([
    { name: 'Dr. Smith', specialization: 'Cardiology' },
    { name: 'Dr. Ali', specialization: 'Neurology' }
  ]);
  const doctors = await doctorService.listDoctors();
  assert.equal(doctors.length, 2);
});

test('get doctor works', async () => {
  const created = await Doctor.create({ name: 'Dr. Ali', specialization: 'Neurology' });
  const doctor = await doctorService.getDoctor(created._id.toString());
  assert.equal(doctor.name, 'Dr. Ali');
});

test('add doctor works', async () => {
  const doctor = await doctorService.addDoctor({ name: 'Dr. Sarah', specialization: 'Dermatology' });
  assert.equal(doctor.name, 'Dr. Sarah');
});

test('update doctor works', async () => {
  const created = await Doctor.create({ name: 'Dr. Sarah', specialization: 'Dermatology' });
  const updated = await doctorService.updateDoctor(created._id.toString(), {
    specialization: 'Internal Medicine'
  });
  assert.equal(updated.specialization, 'Internal Medicine');
});

test('delete doctor works', async () => {
  const created = await Doctor.create({ name: 'Dr. Sarah', specialization: 'Dermatology' });
  await doctorService.deleteDoctor(created._id.toString());
  const remaining = await Doctor.findById(created._id).lean();
  assert.equal(remaining, null);
});

test('invalid doctor id is rejected', async () => {
  await assert.rejects(() => doctorService.getDoctor('not-an-id'), /Doctor not found/);
});
