// Forgotten password: removes the account and all sessions; saved connections stay. Run inside the container
// (`sudo web-ftp-client reset-account` does that and restarts the app, which then prints a new setup code).
import path from 'path';
import { getDb } from './services/db.js';

const appData = process.env.APP_DATA || path.join(process.cwd(), 'data');
const db = getDb(appData);
const has = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (has) {
  db.exec('DELETE FROM sessions; DELETE FROM users;');
  console.log('Account removed. Restart the app for a new setup code.');
} else {
  console.log('No account yet.');
}
db.close();
