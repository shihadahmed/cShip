export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  },
};

let testMongod = null;

export function setTestMongod(mongod) {
  testMongod = mongod;
}

export function clearTestMongod() {
  testMongod = null;
}

export function testConfig(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: 0,
    MONGODB_URI: testMongod?.getUri(),
    CLIENT_ORIGIN: 'http://localhost:3000',
    clientOrigins: ['http://localhost:3000'],
    LOG_LEVEL: 'silent',
    BUILD_MEMORY_MB: 512,
    MAX_CONCURRENT_BUILDS: 1,
    BUILD_TIMEOUT_MS: 900000,
    SSE_HEARTBEAT_MS: 15000,
    isProduction: false,
    SESSION_SECRET: 'a'.repeat(32), // 32-char secret for tests
    ADMIN_GITHUB_LOGINS: 'testadmin', // Default admin login for tests
    ...overrides,
  };
}
