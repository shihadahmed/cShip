import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Set test encryption key before importing models
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let mongod;
let Project;
let User;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const projectModule = await import('../../src/models/Project.js');
  Project = projectModule.default;
  const userModule = await import('../../src/models/User.js');
  User = userModule.default;
  await Project.createIndexes();
  await User.createIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Project.deleteMany({});
  await User.deleteMany({});
});

let user;

test.beforeEach(async () => {
  user = await new User({ githubId: 1, login: 'alice', encryptedToken: 'ghp_token' }).save();
});

test('Project requires userId and repoFullName', async () => {
  const p = new Project({ userId: new mongoose.Types.ObjectId() });
  await assert.rejects(p.validate(), /repoFullName/);
});

test('Project requires name', async () => {
  const p = new Project({ userId: user._id, repoFullName: 'owner/repo' });
  await assert.rejects(p.validate(), /name/);
});

test('defaults defaultBranch to main', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  assert.equal(p.defaultBranch, 'main');
});

test('defaults envVars to empty map', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  assert.ok(p.envVars instanceof Map);
  assert.equal(p.envVars.size, 0);
});

test('accepts envVars as Map', async () => {
  const envVars = new Map([['KEY1', 'value1'], ['KEY2', 'value2']]);
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', envVars });
  await p.save();
  assert.equal(p.envVars.get('KEY1'), 'value1');
  assert.equal(p.envVars.get('KEY2'), 'value2');
});

test('accepts subdomain', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', subdomain: 'myapp' });
  await p.save();
  assert.equal(p.subdomain, 'myapp');
});

test('validates unique subdomain when provided', async () => {
  await new Project({ userId: user._id, name: 'Project 1', repoFullName: 'owner/repo1', subdomain: 'myapp' }).save();
  const p2 = new Project({ userId: user._id, name: 'Project 2', repoFullName: 'owner/repo2', subdomain: 'myapp' });
  await assert.rejects(p2.save(), /duplicate key|E11000/);
});

test('allows multiple projects without subdomain (sparse index)', async () => {
  await new Project({ userId: user._id, name: 'Project 1', repoFullName: 'owner/repo1' }).save();
  const p2 = new Project({ userId: user._id, name: 'Project 2', repoFullName: 'owner/repo2' });
  await p2.save();
  assert.ok(p2._id);
});

test('indexes on userId', async () => {
  const indexes = await Project.collection.getIndexes();
  const hasUserIdIndex = Object.keys(indexes).some(key => key.includes('userId'));
  assert.ok(hasUserIdIndex);
});

test('indexes on repoFullName', async () => {
  const indexes = await Project.collection.getIndexes();
  const hasRepoFullNameIndex = Object.keys(indexes).some(key => key.includes('repoFullName'));
  assert.ok(hasRepoFullNameIndex);
});

test('has timestamps', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  assert.ok(p.createdAt);
  assert.ok(p.updatedAt);
});

test('refers to User model', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  const populated = await Project.findById(p._id).populate('userId');
  assert.equal(populated.userId.login, 'alice');
});