// HTTPS on the app's port, against the built backend (pnpm run build first): a self-signed certificate is made on
// the first start (key 0600) and kept across restarts; HTTPS serves the app with a Secure session cookie and the
// WebSocket as wss; plain HTTP on the same port answers only /healthz and redirects everything else — a sign-in
// sent in clear is never handled; TLS_CERT/TLS_KEY replace the self-signed certificate; TLS=off is plain HTTP.
//   node tools/test-tls.mjs      exit 0 = all passed
import { spawn, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'packages/backend');
const WebSocket = createRequire(path.join(backend, 'package.json'))('ws');
const PORT = 3994;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfc-tls-'));
const appData = path.join(tmp, 'app');
fs.mkdirSync(path.join(tmp, 'data'));

let fails = 0;
const ok = (m) => console.log(`ok   ${m}`);
const bad = (m) => { console.log(`FAIL ${m}`); fails++; };
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(`${m} ${detail}`));

let proc;
async function start(env = {}) {
  proc = spawn('node', [path.join(backend, 'dist/index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: path.join(tmp, 'data'), APP_DATA: appData, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.log = '';
  proc.stdout.on('data', (d) => { proc.log += d; });
  proc.stderr.on('data', (d) => { proc.log += d; });
  for (let i = 0; i < 60; i++) {
    if (/Running on/.test(proc.log)) return;
    if (proc.exitCode !== null) throw new Error('backend exited:\n' + proc.log);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('backend did not start:\n' + proc.log);
}
async function stop() {
  proc.kill('SIGTERM');
  await new Promise((r) => proc.once('exit', r));
}

// one request; the self-signed certificate is not verified here (peerFingerprint checks it)
function req(scheme, method, url, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const mod = scheme === 'https' ? https : http;
    const r = mod.request({ host: '127.0.0.1', port: PORT, method, path: url, headers: { 'Content-Type': 'application/json', ...headers }, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
function peerFingerprint() {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host: '127.0.0.1', port: PORT, rejectUnauthorized: false }, () => {
      resolve(s.getPeerX509Certificate().fingerprint256);
      s.end();
    });
    s.on('error', reject);
  });
}

// an exception outside the checks must still stop the backend and remove the temp folder
process.on('uncaughtException', async (err) => {
  bad(`test aborted: ${err.message}`);
  if (proc && proc.exitCode === null) await stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});

try {
  // 1 first start: self-signed certificate made and kept
  await start();
  const keyFile = path.join(appData, 'tls/key.pem');
  const certFile = path.join(appData, 'tls/cert.pem');
  check(fs.existsSync(certFile) && (fs.statSync(keyFile).mode & 0o777) === 0o600, 'self-signed certificate made, key 0600');
  const fp1 = new crypto.X509Certificate(fs.readFileSync(certFile)).fingerprint256;
  check(proc.log.includes(fp1), 'fingerprint in the log');
  check(await peerFingerprint() === fp1, 'the port serves that certificate');

  // 2 HTTPS serves the app
  let r = await req('https', 'GET', '/');
  check(r.status === 200 && /<div id="root">/.test(r.body), 'HTTPS: app page 200', `(got ${r.status})`);
  r = await req('https', 'GET', '/api/auth/status');
  check(r.status === 200 && JSON.parse(r.body).data.setupRequired === true, 'HTTPS: API answers');

  // 3 plain HTTP: /healthz only, everything else redirected, a sign-in in clear never handled
  r = await req('http', 'GET', '/healthz');
  check(r.status === 200 && r.body === 'ok', 'HTTP /healthz → 200 ok (for the tile probe)');
  r = await req('http', 'GET', '/some/page?x=1', { headers: { Host: `127.0.0.1:${PORT}` } });
  check(r.status === 308 && r.headers.location === `https://127.0.0.1:${PORT}/some/page?x=1`, 'HTTP page → 308 to the same path on HTTPS', `(got ${r.status} ${r.headers.location})`);
  const before = proc.log;
  r = await req('http', 'POST', '/api/auth/login', { headers: { Origin: `http://127.0.0.1:${PORT}` }, body: { username: 'admin', password: 'sent in clear' } });
  check(r.status === 308 && !proc.log.slice(before.length).includes('/api/auth/login'), 'HTTP sign-in → 308, never reaches the app', `(got ${r.status})`);
  r = await req('http', 'GET', '/api/connections');
  check(r.status === 308 && !r.body.includes('ok'), 'HTTP API → 308, no data');

  // 4 setup over HTTPS: Secure cookie, wss with that cookie
  const code = fs.readFileSync(path.join(appData, 'setup-code'), 'utf8').trim();
  r = await req('https', 'POST', '/api/auth/setup', { headers: { Origin: `https://127.0.0.1:${PORT}` }, body: { username: 'admin', password: 'a long test password', setupCode: code } });
  const setCookie = [].concat(r.headers['set-cookie'] || []).join(';');
  check(r.status === 200 && /;\s*Secure/i.test(setCookie) && /HttpOnly/i.test(setCookie), 'setup over HTTPS: cookie Secure + HttpOnly', `(got ${r.status})`);
  const cookie = setCookie.split(';')[0];
  const wss = await new Promise((resolve) => {
    const ws = new WebSocket(`wss://127.0.0.1:${PORT}/ws`, { headers: { Cookie: cookie, Origin: `https://127.0.0.1:${PORT}` }, rejectUnauthorized: false });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_q, res) => resolve(res.statusCode));
    ws.on('error', (e) => resolve(`error ${e.message}`));
  });
  check(wss === 'open', 'WebSocket over wss with the session → open', `(got ${wss})`);

  // 5 restart: same certificate
  await stop(); await start();
  check(await peerFingerprint() === fp1, 'after restart: the same certificate');

  // 6 own certificate via TLS_CERT/TLS_KEY
  await stop();
  const own = path.join(tmp, 'own');
  fs.mkdirSync(own);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(own, 'k.pem'), '-out', path.join(own, 'c.pem'), '-days', '1', '-subj', '/CN=own-test'], { stdio: 'ignore' });
  const fpOwn = new crypto.X509Certificate(fs.readFileSync(path.join(own, 'c.pem'))).fingerprint256;
  await start({ TLS_CERT: path.join(own, 'c.pem'), TLS_KEY: path.join(own, 'k.pem') });
  check(await peerFingerprint() === fpOwn && fpOwn !== fp1, 'TLS_CERT/TLS_KEY: the own certificate is served');

  // 7 TLS=off: plain HTTP serves the app (for a proxy that does HTTPS)
  await stop(); await start({ TLS: 'off' });
  r = await req('http', 'GET', '/api/auth/status');
  check(r.status === 200 && /TLS off/.test(proc.log), 'TLS=off: plain HTTP serves the API, log says so');
} catch (err) {
  bad(`test aborted: ${err.message}`);
} finally {
  if (proc && proc.exitCode === null) await stop();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails === 0 ? '✓ tls: all checks passed' : `✗ tls: ${fails} failed`);
process.exit(fails);
