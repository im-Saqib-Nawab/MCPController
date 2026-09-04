import { BackgroundJob } from '../models/BackgroundJob.js';

const JOB_TYPE = 'load-test';

let activeStatus = null;
let loadTestCache = { value: false, checkedAt: 0 };

export function setActiveLoadTestStatus(status) {
  activeStatus = status;

  if (status && ['running', 'starting', 'stopping'].includes(status)) {
    loadTestCache = { value: true, checkedAt: Date.now() };
    return;
  }

  if (!status) {
    loadTestCache = { value: false, checkedAt: Date.now() };
  }
}

async function hasActiveJobInDatabase() {
  const job = await BackgroundJob.findOne({
    type: JOB_TYPE,
    status: { $in: ['running', 'starting', 'stopping'] }
  })
    .select('_id')
    .lean();

  return Boolean(job);
}

/** True while the Testing Center is driving load-test traffic (dev-only rate-limit bypass). */
export async function isLoadTestRunning() {
  if (activeStatus && ['running', 'starting', 'stopping'].includes(activeStatus)) {
    return true;
  }

  if (Date.now() - loadTestCache.checkedAt < 5000) {
    return loadTestCache.value;
  }

  const value = await hasActiveJobInDatabase();
  loadTestCache = { value, checkedAt: Date.now() };
  return value;
}
