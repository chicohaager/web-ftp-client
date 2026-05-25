import { Router, type Router as RouterType } from 'express';
import { getDb } from '../services/db.js';
import { encrypt, decrypt } from '../services/crypto.js';
import { v4 as uuid } from 'uuid';
import type { ConnectionConfig, ApiResponse } from '@web-ftp-client/shared';

export const connectionsRouter: RouterType = Router();

connectionsRouter.get('/', (_req, res) => {
  const db = getDb(res.app.locals.appData);
  const rows = db.prepare(
    'SELECT id, name, host, port, protocol, username, private_key, last_used, default_local_path, default_remote_path, read_only FROM connections ORDER BY last_used DESC'
  ).all() as Array<{
    id: string; name: string; host: string; port: number; protocol: string;
    username: string; private_key: string; last_used: string | null;
    default_local_path: string; default_remote_path: string; read_only: number;
  }>;
  const connections: ConnectionConfig[] = rows.map(r => ({
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    protocol: r.protocol as ConnectionConfig['protocol'],
    username: r.username,
    hasPrivateKey: !!r.private_key,
    lastUsed: r.last_used ?? undefined,
    defaultLocalPath: r.default_local_path || undefined,
    defaultRemotePath: r.default_remote_path || undefined,
    readOnly: r.read_only === 1,
  }));
  res.json({ ok: true, data: connections } satisfies ApiResponse<ConnectionConfig[]>);
});

connectionsRouter.post('/', (req, res) => {
  const { name, host, port, protocol, username, password, privateKey, defaultLocalPath, defaultRemotePath, readOnly } = req.body;

  if (!name || !host || !protocol) {
    res.status(400).json({ ok: false, error: 'Missing required fields: name, host, protocol' } satisfies ApiResponse);
    return;
  }
  if (typeof port !== 'number' || port < 1 || port > 65535) {
    res.status(400).json({ ok: false, error: 'Port must be 1-65535' } satisfies ApiResponse);
    return;
  }
  if (!['ftp', 'ftps', 'sftp'].includes(protocol)) {
    res.status(400).json({ ok: false, error: 'Protocol must be ftp, ftps, or sftp' } satisfies ApiResponse);
    return;
  }

  const db = getDb(res.app.locals.appData);
  const id = uuid();
  const encryptedPassword = password ? encrypt(password) : '';
  const encryptedKey = privateKey ? encrypt(privateKey) : '';

  db.prepare(
    'INSERT INTO connections (id, name, host, port, protocol, username, password, private_key, default_local_path, default_remote_path, read_only, last_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id, name, host, port, protocol, username || 'anonymous',
    encryptedPassword, encryptedKey,
    defaultLocalPath ?? '', defaultRemotePath ?? '',
    readOnly ? 1 : 0,
    new Date().toISOString(),
  );

  res.status(201).json({ ok: true, data: { id } } satisfies ApiResponse<{ id: string }>);
});

connectionsRouter.put('/:id', (req, res) => {
  const { name, host, port, protocol, username, password, privateKey, defaultLocalPath, defaultRemotePath, readOnly } = req.body;
  const db = getDb(res.app.locals.appData);

  const updates: string[] = [];
  const values: unknown[] = [];

  if (name !== undefined) { updates.push('name=?'); values.push(name); }
  if (host !== undefined) { updates.push('host=?'); values.push(host); }
  if (port !== undefined) { updates.push('port=?'); values.push(port); }
  if (protocol !== undefined) { updates.push('protocol=?'); values.push(protocol); }
  if (username !== undefined) { updates.push('username=?'); values.push(username); }
  if (password !== undefined) { updates.push('password=?'); values.push(encrypt(password)); }
  if (privateKey !== undefined) { updates.push('private_key=?'); values.push(encrypt(privateKey)); }
  if (defaultLocalPath !== undefined) { updates.push('default_local_path=?'); values.push(defaultLocalPath); }
  if (defaultRemotePath !== undefined) { updates.push('default_remote_path=?'); values.push(defaultRemotePath); }
  if (readOnly !== undefined) { updates.push('read_only=?'); values.push(readOnly ? 1 : 0); }

  updates.push('last_used=?');
  values.push(new Date().toISOString());
  values.push(req.params.id);

  if (updates.length > 1) {
    db.prepare(`UPDATE connections SET ${updates.join(', ')} WHERE id=?`).run(...values);
  }

  res.json({ ok: true } satisfies ApiResponse);
});

connectionsRouter.delete('/:id', (req, res) => {
  const db = getDb(res.app.locals.appData);
  db.prepare('DELETE FROM connections WHERE id=?').run(req.params.id);
  res.json({ ok: true } satisfies ApiResponse);
});

export function getConnectionCredentials(appData: string, id: string): { password: string; privateKey: string } | null {
  const db = getDb(appData);
  const row = db.prepare('SELECT password, private_key FROM connections WHERE id=?').get(id) as { password: string; private_key: string } | undefined;
  if (!row) return null;
  return {
    password: row.password ? decrypt(row.password) : '',
    privateKey: row.private_key ? decrypt(row.private_key) : '',
  };
}
