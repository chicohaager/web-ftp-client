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

app.use(express.json({ limit: '100kb' }));

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
  console.log(`Web FTP Client v0.1.0`);
  console.log(`Running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
