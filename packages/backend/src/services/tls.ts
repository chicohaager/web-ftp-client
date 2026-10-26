import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { execFileSync } from 'child_process';
import type http from 'http';

// HTTPS on the app's own port. Without it, password and session cookie cross the LAN in clear: the sign-in
// keeps strangers out, but not someone who reads the traffic.
//
// Certificate: TLS_CERT + TLS_KEY (paths, e.g. from a reverse proxy's certificate store) if set; otherwise a
// self-signed one made on the first start and kept in APP_DATA/tls (key 0600). The browser warns about a
// self-signed certificate once; its SHA-256 fingerprint is in the log and `sudo web-ftp-client tls-fingerprint`
// prints it, so the warning can be checked against it. TLS=off turns this off (a proxy in front does TLS).

export interface TlsMaterial {
  key: Buffer;
  cert: Buffer;
  fingerprint: string;
  selfSigned: boolean;
}

export function tlsEnabled(): boolean {
  return !['off', 'false', '0', 'no'].includes((process.env.TLS || '').trim().toLowerCase());
}

function makeSelfSigned(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const extra = (process.env.TLS_HOSTNAMES || '')
    .split(',').map((h) => h.trim()).filter((h) => /^[A-Za-z0-9.:-]+$/.test(h))
    .map((h) => (net.isIP(h) ? `IP:${h}` : `DNS:${h}`));
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...extra].join(',');
  // written next to the final names and renamed only when both are complete: a start cut off half-way (power
  // loss) leaves no half-written pair behind that would fail every later start
  const keyTmp = path.join(dir, 'key.pem.new');
  const certTmp = path.join(dir, 'cert.pem.new');
  fs.rmSync(keyTmp, { force: true });
  fs.rmSync(certTmp, { force: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', keyTmp, '-out', certTmp, '-days', '3650',
    '-subj', '/CN=Web FTP Client', '-addext', `subjectAltName=${san}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  fs.chmodSync(keyTmp, 0o600);
  for (const f of [keyTmp, certTmp]) {
    const fd = fs.openSync(f, 'r');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  }
  fs.renameSync(keyTmp, path.join(dir, 'key.pem'));
  fs.renameSync(certTmp, path.join(dir, 'cert.pem'));
}

// key and certificate parse and belong together; throws with the reason otherwise
function readPair(keyFile: string, certFile: string): { key: Buffer; cert: Buffer; x509: crypto.X509Certificate } {
  const key = fs.readFileSync(keyFile);
  const cert = fs.readFileSync(certFile);
  const x509 = new crypto.X509Certificate(cert);
  if (!x509.checkPrivateKey(crypto.createPrivateKey(key))) throw new Error('key does not belong to the certificate');
  return { key, cert, x509 };
}

export function loadTls(appData: string): TlsMaterial {
  const ownKey = process.env.TLS_KEY;
  const ownCert = process.env.TLS_CERT;
  if (ownKey || ownCert) {
    // an own certificate never falls back to the self-signed one: that would serve a certificate nobody expects
    if (!ownKey || !ownCert) throw new Error(`TLS_CERT and TLS_KEY must be set together (set: ${ownCert ? 'TLS_CERT' : 'TLS_KEY'})`);
    try {
      const { key, cert, x509 } = readPair(ownKey, ownCert);
      return { key, cert, fingerprint: x509.fingerprint256, selfSigned: false };
    } catch (err) {
      throw new Error(`TLS_CERT ${ownCert} / TLS_KEY ${ownKey} unusable: ${(err as Error).message}`);
    }
  }
  const dir = path.join(appData, 'tls');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) makeSelfSigned(dir);
  let pair;
  try {
    pair = readPair(keyFile, certFile);
  } catch (err) {
    // a file the app may not read (owner changed) is not broken: replacing it would show every browser a new
    // certificate warning — stop and say so
    // (file system errors carry `syscall`; OpenSSL's parse errors carry a `code` too, so that can't tell them apart)
    if ((err as NodeJS.ErrnoException).syscall) throw new Error(`${dir}: ${(err as Error).message} — check owner and permissions of the data folder`);
    // the app made this pair itself, so a broken one (empty, cut off, mismatched) is replaced, not a restart loop
    console.log(`[TLS] ${dir} unusable (${(err as Error).message}): making a new self-signed certificate`);
    makeSelfSigned(dir);
    pair = readPair(keyFile, certFile);
  }
  return { key: pair.key, cert: pair.cert, fingerprint: pair.x509.fingerprint256, selfSigned: true };
}

/**
 * One port for both: a TLS handshake (first byte 0x16) goes to the HTTPS server; anything else is plain HTTP and
 * goes to `plain`, which only answers /healthz and redirects everything else to HTTPS — a request in clear is never
 * handled, so a password can't be accepted unencrypted.
 */
export const FIRST_BYTE_MS = Number(process.env.TLS_FIRST_BYTE_MS) || 10_000;

export function listenMixed(port: number, httpsServer: net.Server, plain: http.Server, ready: () => void): net.Server {
  const mux = net.createServer((socket) => {
    // until the first byte no server's own timeouts apply: a connection that never sends would stay open
    socket.setTimeout(FIRST_BYTE_MS, () => socket.destroy());
    socket.once('data', (first) => {
      socket.setTimeout(0);
      socket.pause();
      socket.unshift(first);
      (first[0] === 0x16 ? httpsServer : plain).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
    socket.on('error', () => socket.destroy());
  });
  mux.listen(port, ready);
  return mux;
}

// path + query of a request URL, also for the absolute form ("GET http://host/x HTTP/1.1")
function pathOf(url: string | undefined): string {
  if (!url) return '/';
  if (url.startsWith('/')) return url;
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return '/';
  }
}

export function plainHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const target = pathOf(req.url);
  // the ZimaOS tile asks /healthz?_ping=<time> (cache buster): the query must not turn it into a redirect
  if (target.split('?')[0] === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }
  const host = (req.headers.host || '').replace(/[^A-Za-z0-9.:[\]-]/g, '');
  if (!host) {
    res.writeHead(400);
    res.end();
    return;
  }
  res.writeHead(308, { Location: `https://${host}${target}`, 'Cache-Control': 'no-store' });
  res.end();
}
