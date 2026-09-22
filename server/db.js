/*
 * server/db.js — SQLite bağlantısı ve şema.
 *
 * Node'un yerleşik `node:sqlite` modülü kullanılır; ek paket kurulumu
 * gerekmez. Başka bir sürücüye (better-sqlite3 gibi) geçilmek istenirse
 * yalnızca bu dosya değiştirilir.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config.js');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  date          TEXT NOT NULL,
  time          TEXT NOT NULL,
  service_ids   TEXT NOT NULL,
  services      TEXT NOT NULL,
  service_label TEXT NOT NULL,
  regions       TEXT NOT NULL,
  total         INTEGER NOT NULL,
  duration      INTEGER NOT NULL,
  status        TEXT,
  source        TEXT NOT NULL DEFAULT 'web'
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (date, time);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function open() {
  if (db) return db;

  const dir = path.dirname(config.databaseFile);
  fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(config.databaseFile);

  /* Dayanıklılık ve eşzamanlılık ayarları */
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);

  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)')
    .run('schema_version', '1');

  return db;
}

function get() {
  return db || open();
}

function close() {
  if (db) { db.close(); db = null; }
}

/* Yazma işlemlerini tek bir işlemde (transaction) çalıştırır. */
function transaction(fn) {
  const handle = get();
  handle.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(handle);
    handle.exec('COMMIT');
    return result;
  } catch (err) {
    try { handle.exec('ROLLBACK'); } catch (rollbackError) { /* yoksayılır */ }
    throw err;
  }
}

module.exports = { open, get, close, transaction };
