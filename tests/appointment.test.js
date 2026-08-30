import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../server/models/User.js';
import { Doctor } from '../server/models/Doctor.js';
import { Appointment } from '../server/models/Appointment.js';
import { addDays, todayUtcDateString, weekdayFromDate } from '../server/lib/availability.js';
import * as appointmentService from '../server/services/appointment.service.js';

function futureAvailableDate(weeklyAvailability = {}, from = todayUtcDateString()) {
  for (let i = 1; i <= 21; i += 1) {
    const date = addDays(from, i);
    const weekday = weekdayFromDate(date);
    if ((weeklyAvailability[weekday] || 'available') === 'available') {
      return date;
    }
  }
  return addDays(from, 1);
}

let app;
let doctorUser;
let otherDoctorUser;
let doctor;
let otherDoctor;
let patientA;
let patientB;

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Appointment.syncIndexes();
  const mod = await import('../server/app.js');
  app = mod.default;
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Doctor.deleteMany({}), Appointment.deleteMany({})]);

  const registerDoctor = await request.agent(app).post('/api/auth/register').send({
    name: 'Dr. Ahmed Khan',
    email: 'ahmed@test.example',
    password: 'password123',
    role: 'doctor',
    specialization: 'Cardiology'
  });
  doctorUser = registerDoctor.body.user;

  const registerOther = await request.agent(app).post('/api/auth/register').send({
    name: 'Dr. Other',
    email: 'other@test.example',
    password: 'password123',
    role: 'doctor',
    specialization: 'Neurology'
  });
  otherDoctorUser = registerOther.body.user;

  const registerA = await request.agent(app).post('/api/auth/register').send({
    name: 'Patient A',
    email: 'a@test.example',
    password: 'password123',
    role: 'patient'
  });
  patientA = registerA.body.user;

  const registerB = await request.agent(app).post('/api/auth/register').send({
    name: 'Patient B',
    email: 'b@test.example',
    password: 'password123',
    role: 'patient'
  });
  patientB = registerB.body.user;

  doctor = await Doctor.findById(doctorUser.doctorId);
  otherDoctor = await Doctor.findById(otherDoctorUser.doctorId);
});

after(async () => {
  await mongoose.disconnect();
});

async function login(email) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(response.status, 200);
  return agent;
}

test('patient can request an available day and cannot modify doctors', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const agent = await login('a@test.example');

  const created = await agent.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  assert.equal(created.status, 201);
  assert.equal(created.body.appointment.status, 'REQUESTED');

  const forbidden = await agent.patch(`/api/doctors/${doctor._id}`).send({ specialization: 'Hacked' });
  assert.equal(forbidden.status, 403);
});

test('two patients can request the same day and only one can be accepted', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const agentA = await login('a@test.example');
  const agentB = await login('b@test.example');
  const doctorAgent = await login('ahmed@test.example');

  const first = await agentA.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  const second = await agentB.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const listed = await doctorAgent.get('/api/appointments');
  const sameDay = listed.body.appointments.filter((item) => item.date === date);
  assert.equal(sameDay.length, 2);

  const accepted = await doctorAgent.post(`/api/appointments/${first.body.appointment.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.appointment.status, 'ACCEPTED');

  const after = await doctorAgent.get('/api/appointments');
  const other = after.body.appointments.find((item) => item.id === second.body.appointment.id);
  assert.ok(['REJECTED', 'ALTERNATIVE_OFFERED'].includes(other.status));
  assert.match(other.rejectionReason, /no longer available/i);

  const publicDoctor = await agentA.get(`/api/doctors/${doctor._id}`);
  const day = publicDoctor.body.doctor.schedule.find((item) => item.date === date);
  assert.equal(day.status, 'busy');

  const clash = await appointmentService.requestAppointment(
    { _id: patientB.id, role: 'patient' },
    { doctorId: String(doctor._id), date }
  ).catch((err) => err);
  assert.equal(clash.status, 409);
});

test('unique index prevents two accepted appointments for the same doctor and day', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  await Appointment.create({
    patientId: patientA.id,
    doctorId: doctor._id,
    date,
    weekday: weekdayFromDate(date),
    status: 'ACCEPTED'
  });

  await assert.rejects(
    () =>
      Appointment.create({
        patientId: patientB.id,
        doctorId: doctor._id,
        date,
        weekday: weekdayFromDate(date),
        status: 'ACCEPTED'
      }),
    /duplicate key|E11000/i
  );
});

test('patient can accept a suggested alternative date', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const alternative = futureAvailableDate(doctor.weeklyAvailability, date);
  const agentA = await login('a@test.example');
  const doctorAgent = await login('ahmed@test.example');

  const created = await agentA.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  await doctorAgent.post(`/api/appointments/${created.body.appointment.id}/suggest`).send({
    dates: [alternative],
    note: 'Please take this day instead.'
  });

  const accepted = await agentA
    .post(`/api/appointments/${created.body.appointment.id}/accept-alternative`)
    .send({ date: alternative });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.appointment.date, alternative);
  assert.equal(accepted.body.appointment.status, 'REQUESTED');
});

test('doctor cannot update another doctor', async () => {
  const agent = await login('ahmed@test.example');
  const forbidden = await agent.patch(`/api/doctors/${otherDoctor._id}`).send({ specialization: 'Hacked' });
  assert.equal(forbidden.status, 403);

  const own = await agent.patch(`/api/doctors/${doctor._id}`).send({ specialization: 'Internal Medicine' });
  assert.equal(own.status, 200);
  assert.equal(own.body.doctor.specialization, 'Internal Medicine');
});

test('concurrent accepts for the same day allow only one confirmation', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const agentA = await login('a@test.example');
  const agentB = await login('b@test.example');
  const doctorAgent = await login('ahmed@test.example');

  const first = await agentA.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  const second = await agentB.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const [acceptA, acceptB] = await Promise.all([
    doctorAgent.post(`/api/appointments/${first.body.appointment.id}/accept`),
    doctorAgent.post(`/api/appointments/${second.body.appointment.id}/accept`)
  ]);

  const statuses = [acceptA.status, acceptB.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const acceptedCount = await Appointment.countDocuments({
    doctorId: doctor._id,
    date,
    status: 'ACCEPTED'
  });
  assert.equal(acceptedCount, 1);
});

test('patient cannot read another patient', async () => {
  const agent = await login('a@test.example');
  const forbidden = await agent.get(`/api/patients/${patientB.id}`);
  assert.equal(forbidden.status, 403);
});
