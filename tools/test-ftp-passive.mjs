// Passive mode against a server behind NAT: a tiny FTP server that refuses EPSV and answers PASV with an address
// the client cannot reach (10.0.0.99) while it listens for the data connection on 127.0.0.1. The backend's
// FtpService must still list the folder (it connects to the control host); basic-ftp's default client must fail
// on the same server — otherwise this test would not reach the PASV path at all.
//   pnpm --filter=backend build && node tools/test-ftp-passive.mjs      exit 0 = all passed
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'packages/backend');
const { FtpService } = await import(pathToFileURL(path.join(backend, 'dist/services/ftp-service.js')).href);
const ftp = createRequire(path.join(backend, 'package.json'))('basic-ftp');

let fails = 0;
const ok = (m) => console.log(`ok   ${m}`);
const bad = (m) => { console.log(`FAIL ${m}`); fails++; };
const commands = [];

const server = net.createServer((sock) => {
  let data = null;
  const reply = (line) => sock.write(line + '\r\n');
  reply('220 test server');
  let buf = '';
  sock.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      const cmd = line.split(' ')[0].toUpperCase();
      commands.push(cmd);
      if (cmd === 'USER') reply('331 password please');
      else if (cmd === 'PASS') reply('230 logged in');
      else if (cmd === 'FEAT') reply('211 no features');
      else if (cmd === 'PWD') reply('257 "/"');
      else if (cmd === 'EPSV') reply('500 EPSV not understood');
      else if (cmd === 'PASV') {
        data = net.createServer();
        data.conn = new Promise((r) => data.once('connection', r));   // the client connects right after PASV
        data.listen(0, '127.0.0.1', () => {
          const p = data.address().port;
          reply(`227 Entering Passive Mode (10,0,0,99,${p >> 8},${p & 255})`);
        });
      } else if (cmd === 'LIST' || cmd === 'MLSD') {
        if (cmd === 'MLSD') { reply('500 no MLSD'); continue; }
        reply('150 here it comes');
        data.conn.then((d) => {
          d.end('-rw-r--r--    1 0        0              11 Oct 26 12:00 hello.txt\r\n', () => {
            data.close();
            setTimeout(() => reply('226 done'), 20);
          });
        });
      } else if (cmd === 'QUIT') { reply('221 bye'); sock.end(); }
      else reply('200 ok');
    }
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const config = { host: '127.0.0.1', port, protocol: 'ftp', username: 'test', password: 'test-pass-1' };

// 1 the default basic-ftp client must refuse this server (proves the test reaches the PASV path)
const plain = new ftp.Client(5000);
try {
  await plain.access({ host: '127.0.0.1', port, user: 'test', password: 'test-pass-1' });
  await plain.list('/');
  bad('basic-ftp default client listed the folder — the test does not reach the PASV address check');
} catch (err) {
  if (/PASV returned another host/.test(err.message)) ok('basic-ftp default client refuses the PASV address (10.0.0.99)');
  else bad(`default client failed differently: ${err.message}`);
}
plain.close();

// 2 the backend's FtpService lists it through the control host
commands.length = 0;
const svc = new FtpService();
try {
  await svc.connect(config);
  const files = await svc.list('/');
  const names = files.map((f) => f.name);
  if (names.includes('hello.txt')) ok('FtpService lists over PASV with the control host (10.0.0.99 ignored)');
  else bad(`FtpService listed ${JSON.stringify(names)}`);
  if (commands.includes('EPSV') && commands.includes('PASV')) ok('EPSV tried first, PASV after its refusal');
  else bad(`commands: ${commands.join(' ')}`);
  commands.length = 0;
  await svc.list('/');
  if (!commands.includes('EPSV') && commands.includes('PASV')) ok('the working strategy is kept (no second EPSV)');
  else bad(`second list sent: ${commands.join(' ')}`);
} catch (err) {
  bad(`FtpService: ${err.message}`);
}
await svc.disconnect().catch(() => {});
server.close();
console.log(fails === 0 ? '✓ ftp passive: all checks passed' : `✗ ftp passive: ${fails} failed`);
process.exit(fails);
