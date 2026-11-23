import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function validateKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a non-empty string');
  }
  if (key.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be valid hexadecimal');
  }
  return Buffer.from(key, 'hex');
}

export function createCrypto(key) {
  const keyBuffer = validateKey(key);

  function encrypt(plaintext) {
    if (typeof plaintext !== 'string') {
      throw new Error('Plaintext must be a string');
    }
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  function decrypt({ iv, ciphertext, tag }) {
    if (!iv || !ciphertext || !tag) {
      throw new Error('Invalid encrypted data: missing iv, ciphertext, or tag');
    }
    let ivBuffer, ciphertextBuffer, tagBuffer;
    try {
      ivBuffer = Buffer.from(iv, 'base64');
      ciphertextBuffer = Buffer.from(ciphertext, 'base64');
      tagBuffer = Buffer.from(tag, 'base64');
    } catch {
      throw new Error('Invalid encrypted data: iv, ciphertext, and tag must be base64 encoded');
    }
    if (ivBuffer.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes`);
    }
    if (tagBuffer.length !== TAG_LENGTH) {
      throw new Error(`Invalid tag length: expected ${TAG_LENGTH} bytes`);
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
    decipher.setAuthTag(tagBuffer);
    let decrypted;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    } catch {
      throw new Error('Decryption failed: auth tag mismatch');
    }
    return decrypted.toString('utf8');
  }

  return { encrypt, decrypt };
}