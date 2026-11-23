import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import next from 'next';

const dir = fileURLToPath(new URL('.', import.meta.url));
const dev = process.env.NODE_ENV !== 'production';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

const app = next({ dev, dir, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => handle(req, res));

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(port, hostname, () => {
  console.log(`cShip dashboard listening on http://${hostname}:${port}`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing dashboard`);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  server.close(() => {
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
