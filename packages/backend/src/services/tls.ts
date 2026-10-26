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
  return (process.env.TLS || '').toLowerCase() !== 'off';
}

function makeSelfSigned(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const extra = (process.env.TLS_HOSTNAMES || '')
    .split(',').map((h) => h.trim()).filter((h) => /^[A-Za-z0-9.:-]+$/.test(h))
    .map((h) => (net.isIP(h) ? `IP:${h}` : `DNS:${h}`));
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...extra].join(',');
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-keyout', keyFile, '-out', certFile, '-days', '3650',
    '-subj', '/CN=Web FTP Client', '-addext', `subjectAltName=${san}`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  fs.chmodSync(keyFile, 0o600);
}

export function loadTls(appData: string): TlsMaterial {
  let keyFile = process.env.TLS_KEY;
  let certFile = process.env.TLS_CERT;
  const selfSigned = !(keyFile && certFile);
  if (selfSigned) {
    const dir = path.join(appData, 'tls');
    keyFile = path.join(dir, 'key.pem');
    certFile = path.join(dir, 'cert.pem');
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) makeSelfSigned(dir);
  }
  const key = fs.readFileSync(keyFile!);
  const cert = fs.readFileSync(certFile!);
  const fingerprint = new crypto.X509Certificate(cert).fingerprint256;
  return { key, cert, fingerprint, selfSigned };
}

/**
 * One port for both: a TLS handshake (first byte 0x16) goes to the HTTPS server; anything else is plain HTTP and
 * goes to `plain`, which only answers /healthz and redirects everything else to HTTPS — a request in clear is never
 * handled, so a password can't be accepted unencrypted.
 */
export function listenMixed(port: number, httpsServer: net.Server, plain: http.Server, ready: () => void): net.Server {
  const mux = net.createServer((socket) => {
    socket.once('data', (first) => {
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

export function plainHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/healthz') {
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
  res.writeHead(308, { Location: `https://${host}${req.url && req.url.startsWith('/') ? req.url : '/'}`, 'Cache-Control': 'no-store' });
  res.end();
}
