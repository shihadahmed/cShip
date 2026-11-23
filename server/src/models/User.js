import mongoose from 'mongoose';
import { createCrypto } from '../lib/crypto.js';
import { loadEnv } from '../config/env.js';

function getTokenEncryptionKey() {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be set in environment');
  }
  return key;
}

const crypto = createCrypto(getTokenEncryptionKey());
let adminGithubLogins = [];

function getAdminLogins() {
  if (adminGithubLogins.length === 0) {
    try {
      const config = loadEnv();
      adminGithubLogins = config.adminGithubLogins || [];
    } catch {
      adminGithubLogins = [];
    }
  }
  return adminGithubLogins;
}

// Allow cache to be cleared for testing
function clearAdminLoginsCache() {
  adminGithubLogins = [];
}

function validateEncryptedToken(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    typeof obj.iv === 'string' &&
    typeof obj.ciphertext === 'string' &&
    typeof obj.tag === 'string'
  );
}

const userSchema = new mongoose.Schema(
  {
    githubId: {
      type: Number,
      required: true,
      unique: true,
    },
    login: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
    },
    avatarUrl: {
      type: String,
    },
    encryptedToken: {
      type: Object,
      required: true,
      validate: {
        validator: function (v) {
          // Allow plain strings (will be encrypted in pre-validate) or encrypted objects
          if (typeof v === 'string') return true;
          return validateEncryptedToken(v);
        },
        message: 'encryptedToken must be a plain string or an object with iv, ciphertext, and tag',
      },
    },
    admin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('validate', function (next) {
  if (typeof this.encryptedToken === 'string') {
    this.encryptedToken = crypto.encrypt(this.encryptedToken);
  }
  const logins = getAdminLogins();
  if (logins.includes(this.login)) {
    this.admin = true;
  }
  next();
});

userSchema.methods.getDecryptedToken = function () {
  return crypto.decrypt(this.encryptedToken);
};

userSchema.statics.setAdminFromConfig = function (user, adminGithubLoginsParam) {
  if (adminGithubLoginsParam && adminGithubLoginsParam.includes(user.login)) {
    user.admin = true;
  }
  return user;
};

// Export for testing
export { getAdminLogins, clearAdminLoginsCache };

export default mongoose.model('User', userSchema);