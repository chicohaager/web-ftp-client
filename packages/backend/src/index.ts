import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectionsRouter } from './routes/connections.js';
import { filesRouter } from './routes/files.js';
import { remoteRouter } from './routes/remote.js';
import { setupTransferWs } from './ws/transfer-ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const APP_DATA = process.env.APP_DATA || path.join(__dirname, '..', 'data');

// crypto.ts resolves its own APP_DATA fallback from process.cwd(), which lands
// somewhere else than the __dirname-relative default above whenever the server
// is started from the repo root (`pnpm start`). That split would write the
// encryption key to one directory and the SQLite DB to another — every saved
// password would silently fail to decrypt after a restart from a different cwd.
// Publish the resolved value so there is exactly one source of truth.
process.env.APP_DATA = APP_DATA;

// 2 MiB ceiling so the /edit endpoint (1 MiB content cap + path + JSON
// overhead) can comfortably pass. Other routes carry tiny bodies, so the
// extra ceiling is harmless.
app.use(express.json({ limit: '2mb' }));

// Convert body-parser's PayloadTooLargeError into a JSON 413 — otherwise
// Express returns an HTML error page and the frontend's `await res.json()`
// blows up with "JSON.parse: unexpected character at line 1 column 1".
app.use((err: Error & { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === 'entity.too.large') {
    res.status(413).json({ ok: false, error: 'Request body exceeds size limit' });
    return;
  }
  next(err);
});

// Request logging (no credentials in logs)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api/')) {
      const level = res.statusCode >= 400 ? 'ERROR' : 'INFO';
      console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Store config in app locals for routes
app.locals.dataDir = DATA_DIR;
app.locals.appData = APP_DATA;

// API routes
app.use('/api/connections', connectionsRouter);
app.use('/api/local', filesRouter);
app.use('/api/remote', remoteRouter);

// API 404 handler
app.all('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Endpoint not found' });
});

// Serve frontend in production
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// WebSocket for transfer progress
setupTransferWs(wss);

server.listen(PORT, () => {
  console.log(`Web FTP Client v0.2.0`);
  console.log(`Running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
