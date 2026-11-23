import { MongoClient, ObjectId } from 'mongodb';

export class QueueError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
    this.details = details;
  }
}

const QUEUE_COLLECTION = 'build_queue';
const JOB_STATUSES = Object.freeze({
  PENDING: 'pending',
  CLAIMED: 'claimed',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export function createQueue(mongoUri, logger) {
  let client;
  let db;
  let collection;

  async function connect() {
    if (client) return;

    client = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
    });

    await client.connect();
    db = client.db();
    collection = db.collection(QUEUE_COLLECTION);

    await collection.createIndex({ status: 1, createdAt: 1 });
    await collection.createIndex({ projectId: 1, status: 1 });
    await collection.createIndex({ claimedBy: 1 });

    logger.info('Build queue connected', { collection: QUEUE_COLLECTION });
  }

  async function disconnect() {
    if (client) {
      await client.close();
      client = null;
      db = null;
      collection = null;
      logger.info('Build queue disconnected');
    }
  }

  function ensureConnected() {
    if (!collection) {
      throw new QueueError('Queue not connected. Call connect() first.', 'NOT_CONNECTED');
    }
  }

  async function enqueue(job) {
    ensureConnected();

    const doc = {
      projectId: job.projectId instanceof ObjectId ? job.projectId : new ObjectId(job.projectId),
      commitSha: job.commitSha,
      branch: job.branch || 'main',
      trigger: job.trigger || 'manual',
      status: JOB_STATUSES.PENDING,
      priority: job.priority || 0,
      payload: job.payload || {},
      createdAt: new Date(),
      updatedAt: new Date(),
      attempts: 0,
      maxAttempts: job.maxAttempts || 3,
      error: null,
      logs: '',
      startedAt: null,
      finishedAt: null,
    };

    const result = await collection.insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  async function claimNext(workerId, options = {}) {
    ensureConnected();

    const { maxConcurrent = 1 } = options;

    const activeCount = await collection.countDocuments({
      status: { $in: [JOB_STATUSES.CLAIMED, JOB_STATUSES.RUNNING] },
      claimedBy: workerId,
    });

    if (activeCount >= maxConcurrent) {
      return null;
    }

    const filter = {
      status: JOB_STATUSES.PENDING,
      $or: [
        { claimedBy: { $exists: false } },
        { claimedBy: null },
      ],
    };

    const update = {
      $set: {
        status: JOB_STATUSES.CLAIMED,
        claimedBy: workerId,
        claimedAt: new Date(),
        updatedAt: new Date(),
      },
      $inc: { attempts: 1 },
    };

    const options_ = {
      sort: { priority: -1, createdAt: 1 },
      returnDocument: 'after',
    };

    const job = await collection.findOneAndUpdate(filter, update, options_);

    if (!job) return null;

    logger.info('Job claimed', { jobId: job._id, workerId, projectId: job.projectId });
    return job;
  }

  async function updateStatus(jobId, status, updates = {}) {
    ensureConnected();

    const allowedStatuses = Object.values(JOB_STATUSES);
    if (!allowedStatuses.includes(status)) {
      throw new QueueError(`Invalid status: ${status}`, 'INVALID_STATUS');
    }

    const update = {
      $set: {
        status,
        updatedAt: new Date(),
        ...updates,
      },
    };

    if (status === JOB_STATUSES.RUNNING && !updates.startedAt) {
      update.$set.startedAt = new Date();
    }

    if (status === JOB_STATUSES.COMPLETED || status === JOB_STATUSES.FAILED || status === JOB_STATUSES.CANCELLED) {
      update.$set.finishedAt = new Date();
    }

    const result = await collection.findOneAndUpdate(
      { _id: jobId instanceof ObjectId ? jobId : new ObjectId(jobId) },
      update,
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new QueueError(`Job not found: ${jobId}`, 'NOT_FOUND');
    }

    logger.debug('Job status updated', { jobId, status });
    return result;
  }

  async function appendLogs(jobId, logChunk) {
    ensureConnected();

    const result = await collection.findOneAndUpdate(
      { _id: jobId instanceof ObjectId ? jobId : new ObjectId(jobId) },
      {
        $set: { updatedAt: new Date() },
        $inc: { logBytes: Buffer.byteLength(logChunk, 'utf8') },
        $push: { logChunks: { $each: [logChunk], $slice: -100 } },
      },
      { returnDocument: 'after' }
    );

    return result;
  }

  async function getJob(jobId) {
    ensureConnected();

    const job = await collection.findOne({ _id: jobId instanceof ObjectId ? jobId : new ObjectId(jobId) });
    return job;
  }

  async function getJobsByProject(projectId, options = {}) {
    ensureConnected();

    const { status, limit = 50, skip = 0, sort = { createdAt: -1 } } = options;

    const filter = { projectId: projectId instanceof ObjectId ? projectId : new ObjectId(projectId) };
    if (status) filter.status = status;

    return collection.find(filter).sort(sort).skip(skip).limit(limit).toArray();
  }

  async function getPendingCount() {
    ensureConnected();
    return collection.countDocuments({ status: JOB_STATUSES.PENDING });
  }

  async function getActiveCount(workerId) {
    ensureConnected();
    return collection.countDocuments({
      status: { $in: [JOB_STATUSES.CLAIMED, JOB_STATUSES.RUNNING] },
      claimedBy: workerId,
    });
  }

  async function releaseJob(jobId, workerId) {
    ensureConnected();

    const result = await collection.findOneAndUpdate(
      {
        _id: jobId instanceof ObjectId ? jobId : new ObjectId(jobId),
        claimedBy: workerId,
        status: { $in: [JOB_STATUSES.CLAIMED, JOB_STATUSES.RUNNING] },
      },
      {
        $set: {
          status: JOB_STATUSES.PENDING,
          claimedBy: null,
          claimedAt: null,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info('Job released back to queue', { jobId, workerId });
    }

    return result;
  }

  async function cancelJob(jobId, reason = 'Cancelled by user') {
    ensureConnected();

    const result = await collection.findOneAndUpdate(
      { _id: jobId instanceof ObjectId ? jobId : new ObjectId(jobId) },
      {
        $set: {
          status: JOB_STATUSES.CANCELLED,
          error: reason,
          updatedAt: new Date(),
          finishedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (result) {
      logger.info('Job cancelled', { jobId, reason });
    }

    return result;
  }

  async function markStaleJobsFailed(timeoutMs = 300000) {
    ensureConnected();

    const threshold = new Date(Date.now() - timeoutMs);

    const result = await collection.updateMany(
      {
        status: { $in: [JOB_STATUSES.CLAIMED, JOB_STATUSES.RUNNING] },
        updatedAt: { $lt: threshold },
      },
      {
        $set: {
          status: JOB_STATUSES.FAILED,
          error: 'Job timed out (stale)',
          updatedAt: new Date(),
          finishedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount > 0) {
      logger.warn('Marked stale jobs as failed', { count: result.modifiedCount });
    }

    return result.modifiedCount;
  }

  return {
    connect,
    disconnect,
    enqueue,
    claimNext,
    updateStatus,
    appendLogs,
    getJob,
    getJobsByProject,
    getPendingCount,
    getActiveCount,
    releaseJob,
    cancelJob,
    markStaleJobsFailed,
    STATUS: JOB_STATUSES,
  };
}