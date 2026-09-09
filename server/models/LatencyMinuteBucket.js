import mongoose from 'mongoose';

const latencyMinuteBucketSchema = new mongoose.Schema(
  {
    route: { type: String, required: true },
    method: { type: String, default: '*' },
    minuteStart: { type: Date, required: true },
    deploymentVersion: String,
    count: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    durationSamples: { type: [Number], default: [] }
  },
  { timestamps: false }
);

latencyMinuteBucketSchema.index({ route: 1, method: 1, minuteStart: -1 });
latencyMinuteBucketSchema.index({ minuteStart: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const MAX_SAMPLES_PER_BUCKET = 200;

export const LatencyMinuteBucket =
  mongoose.models.LatencyMinuteBucket ||
  mongoose.model('LatencyMinuteBucket', latencyMinuteBucketSchema);

export async function upsertLatencyMinuteBucket({ route, method, durationMs, isError, deploymentVersion }) {
  if (process.env.NODE_ENV === 'test') return;

  const minuteStart = new Date(Math.floor(Date.now() / 60000) * 60000);

  const bucket = await LatencyMinuteBucket.findOneAndUpdate(
    { route, method: method || '*', minuteStart },
    {
      $inc: { count: 1, errorCount: isError ? 1 : 0 },
      $set: { deploymentVersion: deploymentVersion || undefined }
    },
    { upsert: true, new: true }
  );

  if (bucket.durationSamples.length < MAX_SAMPLES_PER_BUCKET) {
    bucket.durationSamples.push(Math.round(durationMs));
    await bucket.save();
  }
}
