// Sign-in, end to end against the built backend (pnpm run build first): every /api route needs a session, the
// account can only be created with the setup code, failed attempts are throttled, the cookie is HttpOnly and
// SameSite=Strict, changes from another origin and the WebSocket without a session are refused, sign-out and
// password change end sessions, and account and session survive a restart.
//   node tools/test-auth.mjs      exit 0 = all passed
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'packages/backend');
const WebSocket = createRequire(path.join(backend, 'package.json'))('ws');
const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = { Origin: BASE };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfc-auth-'));
const appData = path.join(tmp, 'app');
fs.mkdirSync(path.join(tmp, 'data'));

let fails = 0;
const ok = (m) => console.log(`ok   ${m}`);
const bad = (m) => { console.log(`FAIL ${m}`); fails++; };
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m} ${detail}`));

let proc;
async function start() {
  proc = spawn('node', [path.join(backend, 'dist/index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, 'data'), APP_DATA: appData },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.log = '';
  proc.stdout.on('data', (d) => { proc.log += d; });
  proc.stderr.on('data', (d) => { proc.log += d; });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/auth/status`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('backend did not start:\n' + proc.log);
}
async function stop() {
  proc.kill('SIGTERM');
  await new Promise((r) => proc.once('exit', r));
}

async function call(method, url, { body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' };
}
const cookieOf = (setCookie) => setCookie.split(';')[0];

function wsOpen(headers) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
}

try {
  await start();

  // 1 before the account exists
  let r = await call('GET', '/api/auth/status');
  check(r.json?.data?.setupRequired === true && r.json?.data?.signedIn === false, 'fresh install: setup required');
  const codeFile = path.join(appData, 'setup-code');
  const code = fs.readFileSync(codeFile, 'utf8').trim();
  check(code.length >= 12 && (fs.statSync(codeFile).mode & 0o777) === 0o600, 'setup code written, file 0600');
  for (const [m, u] of [['GET', '/api/connections'], ['GET', '/api/local/list?path=/'], ['GET', '/api/remote/transfers'], ['POST', '/api/remote/connect']]) {
    r = await call(m, u, { headers: ORIGIN, body: m === 'POST' ? {} : undefined });
    check(r.status === 401, `${m} ${u.split('?')[0]} without session → 401`, `(got ${r.status})`);
  }
  check(await wsOpen({ Origin: BASE }) === 401, 'WebSocket without session → 401');

  r = await call('POST', '/api/auth/setup', { headers: ORIGIN, body: { username: 'admin', password: 'correct horse battery', setupCode: 'wrong-code-x' } });
  check(r.status === 403, 'setup with a wrong code → 403', `(got ${r.status})`);
  r = await call('POST', '/api/auth/setup', { body: { username: 'admin', password: 'correct horse battery', setupCode: code } });
  check(r.status === 403, 'setup without Origin → 403', `(got ${r.status})`);
  r = await call('POST', '/api/auth/setup', { headers: ORIGIN, body: { username: 'admin', password: 'short', setupCode: code } });
  check(r.status === 400, 'setup with a 5-character password → 400', `(got ${r.status})`);
  r = await call('POST', '/api/auth/setup', { headers: ORIGIN, body: { username: 'admin', password: 'correct horse battery', setupCode: code } });
  check(r.status === 200, 'setup with the code → account created', `(got ${r.status} ${JSON.stringify(r.json)})`);
  check(/HttpOnly/i.test(r.setCookie) && /SameSite=Strict/i.test(r.setCookie), 'session cookie HttpOnly, SameSite=Strict', r.setCookie.replace(/=[^;]+/, '=…'));
  check(!fs.existsSync(codeFile), 'setup code file removed');
  const firstCookie = cookieOf(r.setCookie);
  r = await call('POST', '/api/auth/setup', { headers: ORIGIN, body: { username: 'evil', password: 'another long password', setupCode: code } });
  check(r.status === 409, 'second setup → 409', `(got ${r.status})`);
  check(!proc.log.includes('correct horse battery'), 'password never in the log');

  // 2 signed in
  r = await call('GET', '/api/connections', { cookie: firstCookie });
  check(r.status === 200, 'API with session → 200', `(got ${r.status})`);
  r = await call('POST', '/api/connections', { cookie: firstCookie, headers: { Origin: 'http://evil.example' }, body: { name: 'x', host: 'h', port: 21, protocol: 'ftp', username: 'u', password: 'p' } });
  check(r.status === 403, 'change from another origin, with session → 403', `(got ${r.status})`);
  r = await call('POST', '/api/connections', { cookie: firstCookie, headers: { Origin: 'http://127.0.0.1:8080' }, body: { name: 'x', host: 'h', port: 21, protocol: 'ftp', username: 'u', password: 'p' } });
  check(r.status === 403, 'change from another port of the same host → 403', `(got ${r.status})`);
  check(await wsOpen({ Origin: BASE, Cookie: firstCookie }) === 'open', 'WebSocket with session → open');
  check(await wsOpen({ Origin: 'http://evil.example', Cookie: firstCookie }) === 403, 'WebSocket from another origin → 403');

  // 3 failed sign-ins are throttled
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'wrong password ' + i } });
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'correct horse battery' } });
  check(r.status === 429, '6th attempt after 5 failures → 429 (even with the right password)', `(got ${r.status})`);
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'nobody', password: 'x' } });
  check(r.status === 429, 'lock applies to every user name from that address', `(got ${r.status})`);
  await stop(); await start();   // the lock lives in memory: a restart clears it, the account stays

  // 4 restart: account and session survive
  r = await call('GET', '/api/auth/status', { cookie: firstCookie });
  check(r.json?.data?.setupRequired === false && r.json?.data?.signedIn === true, 'after restart: no setup, session still valid');
  check(!fs.existsSync(codeFile) && !proc.log.includes('Setup code'), 'after restart: no new setup code');
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'wrong' } });
  check(r.status === 401 && r.json?.error === 'Wrong user name or password', 'wrong password → 401');
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'nobody', password: 'wrong' } });
  check(r.status === 401 && r.json?.error === 'Wrong user name or password', 'unknown user → same 401 text');
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'correct horse battery' } });
  check(r.status === 200, 'sign in with the password → 200', `(got ${r.status})`);
  const secondCookie = cookieOf(r.setCookie);

  // 5 sign-out ends only that session
  r = await call('POST', '/api/auth/logout', { cookie: secondCookie, headers: ORIGIN });
  r = await call('GET', '/api/connections', { cookie: secondCookie });
  check(r.status === 401, 'after sign-out the cookie is dead', `(got ${r.status})`);
  r = await call('GET', '/api/connections', { cookie: firstCookie });
  check(r.status === 200, 'the other browser stays signed in', `(got ${r.status})`);

  // 6 password change ends all other sessions
  r = await call('POST', '/api/auth/password', { cookie: firstCookie, headers: ORIGIN, body: { currentPassword: 'not it', newPassword: 'a brand new password' } });
  check(r.status === 403, 'password change with a wrong current password → 403', `(got ${r.status})`);
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'correct horse battery' } });
  const thirdCookie = cookieOf(r.setCookie);
  r = await call('POST', '/api/auth/password', { cookie: firstCookie, headers: ORIGIN, body: { currentPassword: 'correct horse battery', newPassword: 'a brand new password' } });
  check(r.status === 200, 'password change → 200', `(got ${r.status})`);
  const fourthCookie = cookieOf(r.setCookie);
  r = await call('GET', '/api/connections', { cookie: thirdCookie });
  check(r.status === 401, 'password change signs out the other browsers', `(got ${r.status})`);
  r = await call('GET', '/api/connections', { cookie: fourthCookie });
  check(r.status === 200, 'the browser that changed it gets a fresh session', `(got ${r.status})`);
  r = await call('POST', '/api/auth/login', { headers: ORIGIN, body: { username: 'admin', password: 'a brand new password' } });
  check(r.status === 200, 'sign in with the new password', `(got ${r.status})`);

  // 7 the database holds no password, only a scrypt hash, and no session token in clear
  const dump = fs.readFileSync(path.join(appData, 'ftp-client.db')).toString('latin1') +
    (fs.existsSync(path.join(appData, 'ftp-client.db-wal')) ? fs.readFileSync(path.join(appData, 'ftp-client.db-wal')).toString('latin1') : '');
  check(!dump.includes('a brand new password') && dump.includes('scrypt$'), 'database: scrypt hash, no password');
  check(!dump.includes(fourthCookie.split('=')[1]), 'database: no session token in clear');

  // 8 forgotten password: reset-account removes account and sessions, keeps saved connections
  r = await call('POST', '/api/connections', { cookie: fourthCookie, headers: ORIGIN, body: { name: 'keep me', host: 'h', port: 21, protocol: 'ftp', username: 'u', password: 'p' } });
  check(r.status === 201 || r.status === 200, 'a saved connection', `(got ${r.status})`);
  await stop();
  const reset = spawn('node', [path.join(backend, 'dist/reset-account.js')], { env: { ...process.env, APP_DATA: appData }, stdio: ['ignore', 'pipe', 'pipe'] });
  let resetOut = '';
  reset.stdout.on('data', (d) => { resetOut += d; });
  const resetRc = await new Promise((res) => reset.once('exit', res));
  check(resetRc === 0 && resetOut.includes('Account removed'), 'reset-account removes the account', `(rc ${resetRc}: ${resetOut.trim()})`);
  await start();
  r = await call('GET', '/api/auth/status', { cookie: fourthCookie });
  check(r.json?.data?.setupRequired === true && r.json?.data?.signedIn === false, 'after reset: setup again, old session dead');
  const code2 = fs.readFileSync(codeFile, 'utf8').trim();
  check(code2 && code2 !== code, 'after reset: a new setup code');
  r = await call('POST', '/api/auth/setup', { headers: ORIGIN, body: { username: 'admin2', password: 'another long password', setupCode: code2 } });
  const fifthCookie = cookieOf(r.setCookie);
  r = await call('GET', '/api/connections', { cookie: fifthCookie });
  check(JSON.stringify(r.json).includes('keep me'), 'after reset: the saved connection is still there');
} catch (err) {
  bad(`test aborted: ${err.message}`);
} finally {
  if (proc && proc.exitCode === null) await stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails === 0 ? '✓ auth: all checks passed' : `✗ auth: ${fails} failed`);
process.exit(fails);
