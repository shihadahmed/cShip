import test from 'node:test';
import assert from 'node:assert/strict';

test('encrypt/decrypt round-trip preserves data', async () => {
  const { createCrypto } = await import('../src/lib/crypto.js');
  const key = '0'.repeat(64);
  const { encrypt, decrypt } = createCrypto(key);
  const data = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const enc = encrypt(data);
  assert.ok(enc.iv && enc.ciphertext && enc.tag);
  const dec = decrypt(enc);
  assert.equal(dec, data);
});

test('tampered ciphertext throws', async () => {
  const { createCrypto } = await import('../src/lib/crypto.js');
  const key = '0'.repeat(64);
  const { encrypt, decrypt } = createCrypto(key);
  const enc = encrypt('secret');
  // Guarantee the tampered value differs from the original (the last base64
  // character may already be the replacement character, which made this flaky).
  enc.ciphertext = (enc.ciphertext[0] === 'A' ? 'B' : 'A') + enc.ciphertext.slice(1);
  assert.throws(() => decrypt(enc), /auth tag/);
});

test('wrong key throws', async () => {
  const { createCrypto } = await import('../src/lib/crypto.js');
  const { encrypt } = createCrypto('0'.repeat(64));
  const { decrypt } = createCrypto('1'.repeat(64));
  const enc = encrypt('secret');
  assert.throws(() => decrypt(enc), /auth tag/);
});

test('different IVs produce different ciphertexts', async () => {
  const { createCrypto } = await import('../src/lib/crypto.js');
  const key = '0'.repeat(64);
  const { encrypt, decrypt } = createCrypto(key);
  const data = 'same data';
  const enc1 = encrypt(data);
  const enc2 = encrypt(data);
  assert.notEqual(enc1.iv, enc2.iv);
  assert.notEqual(enc1.ciphertext, enc2.ciphertext);
  assert.equal(decrypt(enc1), data);
  assert.equal(decrypt(enc2), data);
});