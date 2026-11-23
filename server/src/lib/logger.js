const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
});

const SENSITIVE_KEY =
  /(token|secret|password|authorization|cookie|api[-_]?key|uri|dsn|connection[-_]?string)/i;
const URI_CREDENTIALS = /(mongodb(?:\+srv)?:\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi;
const BEARER_TOKEN = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const QUERY_SECRET = /((?:token|secret|password|api[_-]?key|key)=)[^&\s]+/gi;

function redactString(value) {
  return value
    .replace(URI_CREDENTIALS, '$1[redacted]$3')
    .replace(BEARER_TOKEN, '$1[redacted]')
    .replace(QUERY_SECRET, '$1[redacted]');
}

function redact(value, depth = 0) {
  if (typeof value === 'string') return redactString(value);
  if (depth > 4) return '[max-depth]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? '[redacted]'
        : redact(entry, depth + 1);
    }
    return output;
  }

  return value;
}

function formatMeta(meta) {
  const entries = Object.entries(meta);
  if (entries.length === 0) return '';

  const rendered = entries
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}=${value}`;
      return `${key}=${JSON.stringify(value)}`;
    })
    .join(' ');

  return ` ${rendered}`;
}

export function createLogger({
  level = 'info',
  nodeEnv = 'development',
  bindings = {},
} = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const structured = nodeEnv === 'production';

  const emit = (entryLevel, message, meta = {}) => {
    if (LEVELS[entryLevel] < threshold) return;

    const safeBindings = redact(bindings);
    const safeMeta = redact(meta);
    const entry = {
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...safeBindings,
      ...safeMeta,
    };

    const line = structured
      ? JSON.stringify(entry)
      : `[${entry.time}] ${entryLevel.toUpperCase().padEnd(5)} ${message}${formatMeta(
          { ...safeBindings, ...safeMeta },
        )}`;

    if (entryLevel === 'error') {
      console.error(line);
    } else if (entryLevel === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug(message, meta) {
      emit('debug', message, meta);
    },
    info(message, meta) {
      emit('info', message, meta);
    },
    warn(message, meta) {
      emit('warn', message, meta);
    },
    error(message, meta) {
      emit('error', message, meta);
    },
    child(extraBindings = {}) {
      return createLogger({
        level,
        nodeEnv,
        bindings: { ...bindings, ...extraBindings },
      });
    },
  };
}
