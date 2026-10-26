import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';

// One account per installation. Until it exists, the app only offers the setup page, and creating the account
// needs a one-time setup code: whoever reaches the port first must not be able to claim the app. The code is
// written to APP_DATA/setup-code (0600) and the log; `sudo web-ftp-client setup-code` prints it on ZimaOS.

export const SESSION_COOKIE = 'wfc_session';
const SESSION_DAYS = 7;
const MIN_PASSWORD = 10;
const MAX_FIELD = 256;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function appData(): string {
  return process.env.APP_DATA || path.join(process.cwd(), 'data');
}

function db() {
  const d = getDb(appData());
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
  `);
  return d;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('hex')}$${key.toString('hex')}`;
}

// A fixed hash to compare against when the user name is unknown, so both cases take the same time.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { ...SCRYPT, N: Number(n) });
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function hasUser(): boolean {
  return (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0;
}

// --- setup code -------------------------------------------------------------------------------------------

let setupCode: string | null = null;

function setupCodeFile(): string {
  return path.join(appData(), 'setup-code');
}

export function prepareSetup(): void {
  if (hasUser()) {
    fs.rmSync(setupCodeFile(), { force: true });
    setupCode = null;
    return;
  }
  setupCode = crypto.randomBytes(9).toString('base64url'); // 12 characters
  fs.mkdirSync(appData(), { recursive: true });
  fs.writeFileSync(setupCodeFile(), setupCode + '\n', { mode: 0o600 });
  console.log(`[AUTH] No account yet. Setup code: ${setupCode}  (on ZimaOS: sudo web-ftp-client setup-code)`);
}

function sameCode(given: string): boolean {
  if (!setupCode) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(setupCode).digest();
  return crypto.timingSafeEqual(a, b);
}

// --- failed attempts --------------------------------------------------------------------------------------
// Per client address: 5 failures within 15 minutes lock that address for 15 minutes. Counted for login,
// setup and password change alike.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_TRACKED = 10000;
// count: failures in the window that began at `first`; lockedUntil: set by the 5th failure, 15 minutes from then
const failures = new Map<string, { count: number; first: number; lockedUntil: number }>();

// req.ip is the socket address, or with TRUST_PROXY the client address the proxy reports
function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function prune(now: number): void {
  for (const [k, f] of failures) {
    if (f.lockedUntil <= now && f.first + WINDOW_MS <= now) failures.delete(k);
  }
}

function lockedFor(req: Request): number {
  const f = failures.get(clientKey(req));
  return f ? Math.max(0, f.lockedUntil - Date.now()) : 0;
}

function recordFailure(req: Request): void {
  const now = Date.now();
  if (failures.size >= MAX_TRACKED) prune(now);
  const k = clientKey(req);
  let f = failures.get(k);
  if (!f || (f.first + WINDOW_MS <= now && f.lockedUntil <= now)) {
    f = { count: 0, first: now, lockedUntil: 0 };
    failures.set(k, f);
  }
  f.count++;
  if (f.count >= MAX_FAILURES) f.lockedUntil = now + WINDOW_MS;
}

function tooMany(req: Request, res: Response): boolean {
  const left = lockedFor(req);
  if (left > 0) {
    res.setHeader('Retry-After', String(Math.ceil(left / 1000)));
    res.status(429).json({ ok: false, error: `Too many failed attempts. Try again in ${Math.ceil(left / 60000)} min.` });
    return true;
  }
  return false;
}

// --- sessions ---------------------------------------------------------------------------------------------

// Only the session cookie is read. Other cookies on this host (any app on another port can set them) are
// ignored, and a value that is not valid percent-encoding is ignored too — decodeURIComponent throws on it.
function sessionToken(header: string | undefined): string | null {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionTokenHash(req: IncomingMessage): string | null {
  const token = sessionToken(req.headers.cookie);
  return token ? tokenHash(token) : null;
}

export function sessionUser(req: IncomingMessage): { id: number; username: string } | null {
  const token = sessionToken(req.headers.cookie);
  if (!token) return null;
  const row = db().prepare(
    'SELECT users.id AS id, users.username AS username, sessions.expires_at AS exp FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ?',
  ).get(tokenHash(token)) as { id: number; username: string; exp: number } | undefined;
  if (!row) return null;
  if (row.exp < Date.now()) {
    db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return null;
  }
  return { id: row.id, username: row.username };
}

function startSession(req: Request, res: Response, userId: number): void {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const d = db();
  d.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  d.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, expires);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600 * 1000,
  });
}

// --- requests from another origin -------------------------------------------------------------------------
// SameSite=Strict does not separate ports: every app on the same host counts as the same site. So any request
// that changes something, and the WebSocket upgrade, must come from a page of this very origin.

// Behind a reverse proxy that rewrites Host, set TRUST_PROXY (see README): then the host the browser used comes
// from X-Forwarded-Host. Without TRUST_PROXY that header is ignored — anyone could send it.
const TRUST_PROXY = !!process.env.TRUST_PROXY;

export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
  const host = forwarded || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Open WebSockets are checked at the upgrade only; ws/transfer-ws.ts registers a callback here that closes the
// sockets whose session is gone (sign-out, password change). It also runs on a timer for expiry and reset-account.
let onSessionsEnded: () => void = () => {};
export function whenSessionsEnd(cb: () => void): void { onSessionsEnded = cb; }
function sessionsEnded(): void { onSessionsEnded(); }

// --- middleware and handlers ------------------------------------------------------------------------------

// The frontend returns to the sign-in page only on this header: other routes answer 401 for other reasons
// (remote.ts: a request without x-session-id), and that must not sign anyone out.
export const SIGNED_OUT_HEADER = 'X-Signed-Out';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!sessionUser(req)) {
    res.setHeader(SIGNED_OUT_HEADER, '1');
    res.status(401).json({ ok: false, error: 'Not signed in' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
    res.status(403).json({ ok: false, error: 'Request from another origin refused' });
    return;
  }
  next();
}

function field(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, MAX_FIELD) : '';
}

export function status(req: Request, res: Response): void {
  const user = sessionUser(req);
  res.json({ ok: true, data: { setupRequired: !hasUser(), signedIn: !!user, username: user?.username ?? null } });
}

export function setup(req: Request, res: Response): void {
  if (!sameOrigin(req)) { res.status(403).json({ ok: false, error: 'Request from another origin refused' }); return; }
  if (hasUser()) { res.status(409).json({ ok: false, error: 'The account already exists' }); return; }
  if (tooMany(req, res)) return;
  const username = field(req.body?.username).trim();
  const password = field(req.body?.password);
  if (!sameCode(field(req.body?.setupCode).trim())) {
    recordFailure(req);
    res.status(403).json({ ok: false, error: 'Wrong setup code' });
    return;
  }
  if (!username || password.length < MIN_PASSWORD) {
    res.status(400).json({ ok: false, error: `User name required, password at least ${MIN_PASSWORD} characters` });
    return;
  }
  const info = db().prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  fs.rmSync(setupCodeFile(), { force: true });
  setupCode = null;
  console.log('[AUTH] Account created');
  startSession(req, res, Number(info.lastInsertRowid));
  res.json({ ok: true, data: { username } });
}

export function login(req: Request, res: Response): void {
  if (!sameOrigin(req)) { res.status(403).json({ ok: false, error: 'Request from another origin refused' }); return; }
  if (tooMany(req, res)) return;
  const username = field(req.body?.username).trim();
  const password = field(req.body?.password);
  // user names compare without case: "Holgi" and "holgi" are the same account (26.10.2026, a sign-in failed on it)
  const row = db().prepare('SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE').get(username) as
    { id: number; password_hash: string } | undefined;
  const good = verifyPassword(password, row?.password_hash ?? DUMMY_HASH) && !!row;
  if (!good) {
    recordFailure(req);
    console.log(`[AUTH] Failed sign-in from ${clientKey(req)}`);
    res.status(401).json({ ok: false, error: 'Wrong user name or password' });
    return;
  }
  failures.delete(clientKey(req));
  startSession(req, res, row!.id);
  res.json({ ok: true, data: { username } });
}

export function logout(req: Request, res: Response): void {
  if (!sameOrigin(req)) { res.status(403).json({ ok: false, error: 'Request from another origin refused' }); return; }
  const token = sessionToken(req.headers.cookie);
  if (token) db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
  sessionsEnded();
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}

export function changePassword(req: Request, res: Response): void {
  const user = sessionUser(req);
  if (!user) { res.status(401).json({ ok: false, error: 'Not signed in' }); return; }
  if (!sameOrigin(req)) { res.status(403).json({ ok: false, error: 'Request from another origin refused' }); return; }
  if (tooMany(req, res)) return;
  const current = field(req.body?.currentPassword);
  const next = field(req.body?.newPassword);
  const row = db().prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
  if (!verifyPassword(current, row.password_hash)) {
    recordFailure(req);
    res.status(403).json({ ok: false, error: 'Current password is wrong' });
    return;
  }
  if (next.length < MIN_PASSWORD) {
    res.status(400).json({ ok: false, error: `Password at least ${MIN_PASSWORD} characters` });
    return;
  }
  const d = db();
  d.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  d.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // signs out every other browser too
  startSession(req, res, user.id);
  sessionsEnded();
  console.log('[AUTH] Password changed');
  res.json({ ok: true });
}
