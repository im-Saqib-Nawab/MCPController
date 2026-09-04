import { logger, serializeError } from './logger.js';
import { incrementMetric } from './runtime-metrics.js';

const globalCache = globalThis;

if (!globalCache.__mcpcontrollerLogQueue) {
  globalCache.__mcpcontrollerLogQueue = {
    queue: [],
    flushTimer: null,
    flushing: false
  };
}

const state = globalCache.__mcpcontrollerLogQueue;

function scheduleFlush(delayMs) {
  if (state.flushTimer) {
    return;
  }

  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    void flushLogQueue();
  }, delayMs);
}

export function enqueueLogEntry(entry) {
  state.queue.push(entry);

  if (state.queue.length >= 50) {
    void flushLogQueue();
    return;
  }

  scheduleFlush(500);
}

export async function flushLogQueue() {
  if (state.flushing || !state.queue.length) {
    return;
  }

  state.flushing = true;
  const batch = state.queue.splice(0, state.queue.length);

  try {
    const { SystemLog } = await import('../models/SystemLog.js');
    await SystemLog.insertMany(batch, { ordered: false });
    incrementMetric('log_persist_success_total', batch.length);
  } catch (err) {
    incrementMetric('log_persist_failed_total', batch.length);
    logger.warn(
      {
        operation: 'log.persist.failed',
        batchSize: batch.length,
        err: serializeError(err)
      },
      'Failed to persist log batch'
    );
  } finally {
    state.flushing = false;

    if (state.queue.length) {
      scheduleFlush(250);
    }
  }
}

export function getLogQueueDepth() {
  return state.queue.length;
}
