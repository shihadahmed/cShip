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
    // Encrypted access token (required)
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
    // Encrypted refresh token (optional, for token refresh)
    encryptedRefreshToken: {
      type: Object,
      required: false,
      validate: {
        validator: function (v) {
          if (!v) return true; // Optional
          if (typeof v === 'string') return true;
          return validateEncryptedToken(v);
        },
        message: 'encryptedRefreshToken must be a plain string or an object with iv, ciphertext, and tag',
      },
    },
    // Token expiry timestamp (optional, for proactive refresh)
    tokenExpiresAt: {
      type: Date,
      required: false,
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
  if (typeof this.encryptedRefreshToken === 'string') {
    this.encryptedRefreshToken = crypto.encrypt(this.encryptedRefreshToken);
  }
  const logins = getAdminLogins();
  this.admin = logins.includes(this.login);
  next();
});

userSchema.methods.getDecryptedToken = function () {
  return crypto.decrypt(this.encryptedToken);
};

userSchema.methods.getDecryptedRefreshToken = function () {
  if (!this.encryptedRefreshToken) return null;
  return crypto.decrypt(this.encryptedRefreshToken);
};

/**
 * Updates the user's GitHub tokens after a refresh
 */
userSchema.methods.updateGitHubTokens = async function (accessToken, refreshToken, expiresIn) {
  this.encryptedToken = accessToken; // Will be encrypted by pre-validate hook
  if (refreshToken) {
    this.encryptedRefreshToken = refreshToken;
  }
  if (expiresIn) {
    this.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
  }
  await this.save();
};

/**
 * Checks if the access token is expired or about to expire (within 5 minutes)
 */
userSchema.methods.isTokenExpired = function () {
  if (!this.tokenExpiresAt) return false; // Unknown, assume not expired
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return Date.now() >= (this.tokenExpiresAt.getTime() - bufferMs);
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