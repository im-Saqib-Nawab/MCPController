import * as doctorService from '../services/doctor.service.js';

/** Dashboard helper: list doctors for the Admin UI (not used by ChatGPT). */
export async function listDoctors(req, res, next) {
  try {
    const doctors = await doctorService.listDoctors();
    res.json({
      doctors: doctors.map(doctorService.serializeDoctor)
    });
  } catch (err) {
    next(err);
  }
}
