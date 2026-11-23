import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Set test encryption key before importing models
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let mongod;
let Deployment;
let Project;
let User;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const deploymentModule = await import('../../src/models/Deployment.js');
  Deployment = deploymentModule.default;
  const projectModule = await import('../../src/models/Project.js');
  Project = projectModule.default;
  const userModule = await import('../../src/models/User.js');
  User = userModule.default;
  await Deployment.createIndexes();
  await Project.createIndexes();
  await User.createIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Deployment.deleteMany({});
  await Project.deleteMany({});
  await User.deleteMany({});
});

let project;
let user;

test.beforeEach(async () => {
  user = await new User({ githubId: 1, login: 'alice', encryptedToken: 'ghp_token' }).save();
  project = await new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' }).save();
});

test('Deployment status enum constrained to valid values', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main', status: 'invalid' });
  await assert.rejects(d.validate(), /status/);
});

test('accepts valid status values', async () => {
  const validStatuses = ['queued', 'building', 'ready', 'failed', 'cancelled'];
  for (const status of validStatuses) {
    const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main', status });
    await d.validate();
  }
});

test('defaults status to queued', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main' });
  await d.save();
  assert.equal(d.status, 'queued');
});

test('requires projectId, commitSha, branch', async () => {
  const d = new Deployment({ projectId: project._id });
  await assert.rejects(d.validate(), /commitSha/);
  await assert.rejects(d.validate(), /branch/);
});

test('defaults logs to empty string', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main' });
  await d.save();
  assert.equal(d.logs, '');
});

test('allows setting logs', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main', logs: 'Build output...' });
  await d.save();
  assert.equal(d.logs, 'Build output...');
});

test('startedAt and finishedAt are optional Date fields', async () => {
  const startedAt = new Date();
  const finishedAt = new Date(Date.now() + 60000);
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main', startedAt, finishedAt });
  await d.save();
  assert.ok(d.startedAt);
  assert.ok(d.finishedAt);
  assert.equal(d.startedAt.getTime(), startedAt.getTime());
  assert.equal(d.finishedAt.getTime(), finishedAt.getTime());
});

test('indexes on projectId', async () => {
  const indexes = await Deployment.collection.getIndexes();
  const hasProjectIdIndex = Object.keys(indexes).some(key => key.includes('projectId'));
  assert.ok(hasProjectIdIndex);
});

test('indexes on status', async () => {
  const indexes = await Deployment.collection.getIndexes();
  const hasStatusIndex = Object.keys(indexes).some(key => key.includes('status'));
  assert.ok(hasStatusIndex);
});

test('has timestamps', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main' });
  await d.save();
  assert.ok(d.createdAt);
  assert.ok(d.updatedAt);
});

test('refers to Project model', async () => {
  const d = new Deployment({ projectId: project._id, commitSha: 'abc', branch: 'main' });
  await d.save();
  const populated = await Deployment.findById(d._id).populate('projectId');
  assert.equal(populated.projectId.name, 'My Project');
});