import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../server/models/User.js';
import { Doctor } from '../server/models/Doctor.js';
import { Appointment } from '../server/models/Appointment.js';
import {
  addDays,
  todayUtcDateString,
  weekdayFromDate
} from '../server/lib/availability.js';
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

function unavailableDate(weeklyAvailability = {}, from = todayUtcDateString()) {
  for (let i = 1; i <= 21; i += 1) {
    const date = addDays(from, i);
    const weekday = weekdayFromDate(date);
    if ((weeklyAvailability[weekday] || 'available') === 'unavailable') {
      return date;
    }
  }
  return null;
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

test('full flow: request, accept, day becomes unavailable, second patient blocked', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const agentA = await login('a@test.example');
  const agentB = await login('b@test.example');
  const doctorAgent = await login('ahmed@test.example');

  const requested = await agentA.post('/api/appointments').send({ doctorId: String(doctor._id), date });
  assert.equal(requested.status, 201);
  assert.equal(requested.body.appointment.status, 'REQUESTED');

  const pending = await doctorAgent.get('/api/appointments');
  const pendingForDay = pending.body.appointments.filter(
    (item) => item.date === date && item.status === 'REQUESTED'
  );
  assert.ok(pendingForDay.length >= 1);

  const accepted = await doctorAgent.post(`/api/appointments/${requested.body.appointment.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.appointment.status, 'ACCEPTED');

  const availability = await appointmentService.checkDoctorAvailability(String(doctor._id), date);
  assert.equal(availability.available, false);
  assert.equal(availability.reason, 'already_booked');

  const blocked = await agentB
    .post('/api/appointments')
    .send({ doctorId: String(doctor._id), date })
    .catch((err) => err);
  if (blocked.response) {
    assert.equal(blocked.response.status, 409);
  } else {
    const secondTry = await appointmentService
      .requestAppointment({ _id: patientB.id, role: 'patient' }, { doctorId: String(doctor._id), date })
      .catch((err) => err);
    assert.equal(secondTry.status, 409);
  }
});

test('doctor cannot book themselves but can book another doctor', async () => {
  const date = futureAvailableDate(otherDoctor.weeklyAvailability);
  const selfBooking = await appointmentService
    .requestAppointment({ _id: doctorUser.id, role: 'doctor' }, { doctorId: String(doctor._id), date })
    .catch((err) => err);
  assert.equal(selfBooking.status, 403);

  const otherBooking = await appointmentService.requestAppointment(
    { _id: doctorUser.id, role: 'doctor' },
    { doctorId: String(otherDoctor._id), date }
  );
  assert.equal(otherBooking.status, 'REQUESTED');
});

test('duplicate appointment for same patient and day is rejected', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  await appointmentService.requestAppointment(
    { _id: patientA.id, role: 'patient' },
    { doctorId: String(doctor._id), date }
  );

  const duplicate = await appointmentService
    .requestAppointment(
      { _id: patientA.id, role: 'patient' },
      { doctorId: String(doctor._id), date }
    )
    .catch((err) => err);
  assert.equal(duplicate.status, 409);
});

test('past dates and unavailable weekdays are rejected', async () => {
  const past = addDays(todayUtcDateString(), -1);
  const pastError = await appointmentService
    .requestAppointment(
      { _id: patientA.id, role: 'patient' },
      { doctorId: String(doctor._id), date: past }
    )
    .catch((err) => err);
  assert.equal(pastError.status, 400);

  const unavailable = unavailableDate(doctor.weeklyAvailability);
  if (unavailable) {
    const unavailableError = await appointmentService
      .requestAppointment(
        { _id: patientA.id, role: 'patient' },
        { doctorId: String(doctor._id), date: unavailable }
      )
      .catch((err) => err);
    assert.equal(unavailableError.status, 400);
  }
});

test('cancelled appointment frees the doctor day again', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const created = await appointmentService.requestAppointment(
    { _id: patientA.id, role: 'patient' },
    { doctorId: String(doctor._id), date }
  );
  const accepted = await appointmentService.acceptAppointment(created.id, {
    _id: doctorUser.id,
    role: 'doctor'
  });
  assert.equal(accepted.status, 'ACCEPTED');

  await appointmentService.cancelAppointment(created.id, { _id: patientA.id, role: 'patient' });

  const availability = await appointmentService.checkDoctorAvailability(String(doctor._id), date);
  assert.equal(availability.available, true);

  const rebook = await appointmentService.requestAppointment(
    { _id: patientB.id, role: 'patient' },
    { doctorId: String(doctor._id), date }
  );
  assert.equal(rebook.status, 'REQUESTED');
});

test('doctor cannot manage another doctors appointment', async () => {
  const date = futureAvailableDate(otherDoctor.weeklyAvailability);
  const created = await appointmentService.requestAppointment(
    { _id: patientA.id, role: 'patient' },
    { doctorId: String(otherDoctor._id), date }
  );

  const forbidden = await appointmentService
    .acceptAppointment(created.id, { _id: doctorUser.id, role: 'doctor' })
    .catch((err) => err);
  assert.equal(forbidden.status, 403);
});

test('patient cannot read another patient appointment', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const created = await appointmentService.requestAppointment(
    { _id: patientA.id, role: 'patient' },
    { doctorId: String(doctor._id), date }
  );

  const forbidden = await appointmentService
    .getAppointment(created.id, { _id: patientB.id, role: 'patient' })
    .catch((err) => err);
  assert.equal(forbidden.status, 403);
});

test('non-admin cannot use admin dashboard stats', async () => {
  const forbidden = await appointmentService
    .adminDashboardStats({ _id: patientA.id, role: 'patient' })
    .catch((err) => err);
  assert.equal(forbidden.status, 403);
});

test('patient cannot create an appointment for another patient', async () => {
  const date = futureAvailableDate(doctor.weeklyAvailability);
  const forbidden = await appointmentService
    .requestAppointment(
      { _id: patientA.id, role: 'patient' },
      { doctorId: String(doctor._id), date, patientId: patientB.id }
    )
    .catch((err) => err);
  assert.equal(forbidden.status, 403);
});
