import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDb(appDataDir: string): Database.Database {
  if (db) return db;

  fs.mkdirSync(appDataDir, { recursive: true });
  const dbPath = path.join(appDataDir, 'ftp-client.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 21,
      protocol TEXT NOT NULL DEFAULT 'ftp',
      username TEXT NOT NULL DEFAULT 'anonymous',
      password TEXT NOT NULL DEFAULT '',
      private_key TEXT NOT NULL DEFAULT '',
      last_used TEXT
    );

    CREATE TABLE IF NOT EXISTS transfer_history (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      destination_path TEXT NOT NULL,
      direction TEXT NOT NULL,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      connection_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE SET NULL
    );
  `);

  // Migration: add private_key column if not exists
  const columns = db.prepare("PRAGMA table_info(connections)").all() as Array<{ name: string }>;
  if (!columns.find(c => c.name === 'private_key')) {
    db.exec("ALTER TABLE connections ADD COLUMN private_key TEXT NOT NULL DEFAULT ''");
  }

  return db;
}

// Graceful shutdown
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);
