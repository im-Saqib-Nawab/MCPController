import mongoose from 'mongoose';

const STANDALONE_ERROR = /replica set member|mongos/i;

/**
 * Run work inside a MongoDB transaction when the deployment supports it.
 * Falls back to running without a session on standalone local MongoDB instances.
 */
export async function withOptionalTransaction(work) {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction().catch(() => {});

    if (STANDALONE_ERROR.test(String(err?.message || ''))) {
      return work(null);
    }

    throw err;
  } finally {
    session.endSession();
  }
}
