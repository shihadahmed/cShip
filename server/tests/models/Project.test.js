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
  await mongoose.connect(uri, { autoIndex: false });
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
  await mongoose.connection.db.dropDatabase();
  await Project.createIndexes();
  await User.createIndexes();
  user = await new User({ githubId: 1, login: 'alice', encryptedToken: 'ghp_token' }).save();
});

let user;

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

// --- New field tests (Task 1) ---

test('Project accepts framework enum', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', framework: 'nextjs' });
  await p.validate(); // should pass
});

test('Project rejects invalid framework', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', framework: 'invalid' });
  await assert.rejects(p.validate(), /framework/);
});

test('Project accepts build/install/start commands and outputDirectory', async () => {
  const p = new Project({
    userId: user._id,
    name: 'My Project',
    repoFullName: 'owner/repo',
    buildCommand: 'npm run build',
    installCommand: 'npm ci',
    startCommand: 'npm start',
    outputDirectory: '.next'
  });
  await p.validate(); // should pass
});

test('Project accepts passenger subdocument', async () => {
  const p = new Project({
    userId: user._id,
    name: 'My Project',
    repoFullName: 'owner/repo',
    passenger: { registered: true, applicationName: 'myapp', baseUri: '/myapp' }
  });
  await p.validate(); // should pass
});

test('Project accepts webhook subdocument', async () => {
  const p = new Project({
    userId: user._id,
    name: 'My Project',
    repoFullName: 'owner/repo',
    webhook: { id: '123', secret: 'encrypted', active: true }
  });
  await p.validate(); // should pass
});

test('Project accepts documentRoot and projectRoot', async () => {
  const p = new Project({
    userId: user._id,
    name: 'My Project',
    repoFullName: 'owner/repo',
    documentRoot: '/home/user/public_html/myapp',
    projectRoot: '/home/user/deployments/myapp'
  });
  await p.validate(); // should pass
});

test('defaults framework to nextjs', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  assert.equal(p.framework, 'nextjs');
});

test('defaults buildCommand, installCommand, startCommand, outputDirectory', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo' });
  await p.save();
  assert.equal(p.buildCommand, 'npm run build');
  assert.equal(p.installCommand, 'npm ci');
  assert.equal(p.startCommand, 'npm start');
  assert.equal(p.outputDirectory, '.next');
});

test('accepts repo subdocument', async () => {
  const p = new Project({
    userId: user._id,
    name: 'My Project',
    repoFullName: 'owner/repo',
    repo: {
      fullName: 'owner/repo',
      htmlUrl: 'https://github.com/owner/repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      defaultBranch: 'main'
    }
  });
  await p.validate();
});

test('accepts slug with unique sparse index', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', slug: 'my-project' });
  await p.save();
  assert.equal(p.slug, 'my-project');
});

test('validates unique slug when provided', async () => {
  await new Project({ userId: user._id, name: 'Project 1', repoFullName: 'owner/repo1', slug: 'my-project' }).save();
  const p2 = new Project({ userId: user._id, name: 'Project 2', repoFullName: 'owner/repo2', slug: 'my-project' });
  await assert.rejects(p2.save(), /duplicate key|E11000/);
});

test('allows multiple projects without slug (sparse index)', async () => {
  await new Project({ userId: user._id, name: 'Project 1', repoFullName: 'owner/repo1' }).save();
  const p2 = new Project({ userId: user._id, name: 'Project 2', repoFullName: 'owner/repo2' });
  await p2.save();
  assert.ok(p2._id);
});

test('accepts domain field', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', domain: 'example.com' });
  await p.validate();
});

test('accepts branch field separate from defaultBranch', async () => {
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', branch: 'develop', defaultBranch: 'main' });
  await p.save();
  assert.equal(p.branch, 'develop');
  assert.equal(p.defaultBranch, 'main');
});

test('accepts lastDeployment as ObjectId ref', async () => {
  const deploymentId = new mongoose.Types.ObjectId();
  const p = new Project({ userId: user._id, name: 'My Project', repoFullName: 'owner/repo', lastDeployment: deploymentId });
  await p.save();
  assert.equal(p.lastDeployment.toString(), deploymentId.toString());
});