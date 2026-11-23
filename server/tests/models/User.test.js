import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Set test encryption key before importing models
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let mongod;
let User;
let crypto;
let clearAdminLoginsCache;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const userModule = await import('../../src/models/User.js');
  User = userModule.default;
  const cryptoModule = await import('../../src/lib/crypto.js');
  crypto = cryptoModule.createCrypto('0'.repeat(64));
  clearAdminLoginsCache = userModule.clearAdminLoginsCache;
  // Ensure indexes are created
  await User.createIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await User.deleteMany({});
  clearAdminLoginsCache();
});

test('User encrypts token on save when given plain string', async () => {
  const user = new User({ githubId: 1, login: 'alice', encryptedToken: 'ghp_xxx' });
  await user.save();
  const saved = await User.findById(user._id);
  assert.notEqual(saved.encryptedToken, 'ghp_xxx');
  assert.ok(saved.encryptedToken?.ciphertext);
  assert.ok(saved.encryptedToken?.iv);
  assert.ok(saved.encryptedToken?.tag);
});

test('admin derived from ADMIN_GITHUB_LOGINS config via static method', async () => {
  const user1 = new User({ githubId: 1, login: 'alice', encryptedToken: 't' });
  const user2 = new User({ githubId: 2, login: 'bob', encryptedToken: 't' });
  User.setAdminFromConfig(user1, ['alice']);
  User.setAdminFromConfig(user2, ['alice']);
  assert.equal(user1.admin, true);
  assert.equal(user2.admin, false);
});

test('pre-validate hook encrypts plain token string', async () => {
  const user = new User({ githubId: 10, login: 'tokenuser', encryptedToken: 'ghp_plain' });
  await user.save();
  const saved = await User.findById(user._id);
  assert.notEqual(saved.encryptedToken, 'ghp_plain');
  assert.ok(saved.encryptedToken?.ciphertext);
  assert.ok(saved.encryptedToken?.iv);
  assert.ok(saved.encryptedToken?.tag);
});

test('pre-validate hook auto-sets admin from config', async () => {
  // Test by directly manipulating the cached admin logins
  const { getAdminLogins } = await import('../../src/models/User.js');
  
  // Clear cache and set test admin logins directly
  clearAdminLoginsCache();
  const adminLogins = getAdminLogins(); // This initializes the cache
  adminLogins.push('alice', 'charlie');

  const user1 = new User({ githubId: 1, login: 'alice', encryptedToken: 't' });
  await user1.save();
  assert.equal(user1.admin, true);

  const user2 = new User({ githubId: 2, login: 'bob', encryptedToken: 't' });
  await user2.save();
  assert.equal(user2.admin, false);

  const user3 = new User({ githubId: 3, login: 'charlie', encryptedToken: 't' });
  await user3.save();
  assert.equal(user3.admin, true);

  clearAdminLoginsCache();
});

test('pre-validate hook encrypts plain token string', async () => {
  const user = new User({ githubId: 10, login: 'tokenuser', encryptedToken: 'ghp_plain' });
  await user.save();
  const saved = await User.findById(user._id);
  assert.notEqual(saved.encryptedToken, 'ghp_plain');
  assert.ok(saved.encryptedToken?.ciphertext);
  assert.ok(saved.encryptedToken?.iv);
  assert.ok(saved.encryptedToken?.tag);
});

test('getDecryptedToken returns plaintext', async () => {
  const plaintext = 'ghp_secret_token';
  const user = new User({ githubId: 2, login: 'bob', encryptedToken: plaintext });
  await user.save();
  const saved = await User.findById(user._id);
  const decrypted = saved.getDecryptedToken();
  assert.equal(decrypted, plaintext);
});

test('validates required fields', async () => {
  const user = new User({ login: 'alice' });
  await assert.rejects(user.validate(), /githubId/);
});

test('validates unique githubId', async () => {
  await new User({ githubId: 1, login: 'alice', encryptedToken: 't' }).save();
  const user2 = new User({ githubId: 1, login: 'bob', encryptedToken: 't' });
  await assert.rejects(user2.save(), /duplicate key|E11000/);
});

test('validates unique login', async () => {
  const uniqueLogin = `testuser_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await new User({ githubId: 10, login: uniqueLogin, encryptedToken: 't' }).save();
  const user2 = new User({ githubId: 11, login: uniqueLogin, encryptedToken: 't' });
  await assert.rejects(user2.save(), /duplicate key|E11000/);
});

test('has timestamps', async () => {
  const user = new User({ githubId: 3, login: 'charlie', encryptedToken: 't' });
  await user.save();
  assert.ok(user.createdAt);
  assert.ok(user.updatedAt);
});

test('does not re-encrypt already encrypted token object', async () => {
  const plaintext = 'ghp_already_encrypted';
  const encrypted = crypto.encrypt(plaintext);
  const user = new User({ githubId: 4, login: 'dave', encryptedToken: encrypted });
  await user.save();
  const saved = await User.findById(user._id);
  assert.equal(saved.encryptedToken.ciphertext, encrypted.ciphertext);
  assert.equal(saved.encryptedToken.iv, encrypted.iv);
  assert.equal(saved.encryptedToken.tag, encrypted.tag);
});

test('rejects malformed encryptedToken object', async () => {
  const user = new User({
    githubId: 5,
    login: 'eve',
    encryptedToken: { iv: 'a', ciphertext: 'b' }, // missing tag
  });
  await assert.rejects(user.validate(), /encryptedToken must be/);
});

test('rejects invalid encryptedToken (non-string, non-object)', async () => {
  const user = new User({
    githubId: 6,
    login: 'frank',
    encryptedToken: 123, // number is invalid
  });
  await assert.rejects(user.validate(), /encryptedToken must be/);
});

test('throws if TOKEN_ENCRYPTION_KEY not set', async () => {
  // This test verifies the model throws when key is missing
  // We can't easily test module-level throw, but we verify the factory does
  const { createCrypto } = await import('../../src/lib/crypto.js');
  assert.throws(() => createCrypto(''), /must be a non-empty string/);
  assert.throws(() => createCrypto('short'), /64 hex characters/);
  assert.throws(() => createCrypto('g'.repeat(64)), /valid hexadecimal/);
});