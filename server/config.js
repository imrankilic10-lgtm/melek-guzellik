/*
 * server/config.js — Sunucu ayarları.
 * Tüm hassas değerler ortam değişkeninden (environment variable) okunur.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/*
 * .env dosyasını okur (varsa). Böylece şifreyi her seferinde komut
 * satırında yazmak gerekmez ve gizli değerler koda girmez.
 * Zaten tanımlı ortam değişkenleri ezilmez.
 */
function loadEnvFile() {
  const envPath = process.env.MELEK_ENV_FILE || path.join(ROOT, '.env');

  let contents;
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    return;                                   /* .env yoksa sorun değil */
  }

  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const separator = trimmed.indexOf('=');
    if (separator < 1) return;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    /* Tırnak içindeki değerlerde tırnakları kaldır */
    const quoted = (value.startsWith('"') && value.endsWith('"')) ||
                   (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length > 1) value = value.slice(1, -1);

    if (process.env[key] === undefined) process.env[key] = value;
  });
}

loadEnvFile();

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const DEV_PASSWORD = 'melek2026';

/*
 * Şifre iki yoldan verilebilir:
 *   MELEK_ADMIN_PASSWORD_FILE → dosyanın içeriği ham şifredir (önerilen)
 *   MELEK_ADMIN_PASSWORD      → doğrudan ortam değişkeni
 *
 * Dosya yöntemi, şifrede $ " \ # gibi karakterler olduğunda ortam
 * dosyası ayrıştırma sorunlarını tamamen ortadan kaldırır.
 */
function readPasswordFile(filePath) {
  try {
    /* Yalnızca tek bir sondaki satır sonu atılır; şifre boşlukla bitebilir */
    return fs.readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
  } catch (err) {
    console.error('Şifre dosyası okunamadı: ' + filePath);
    console.error(err.message);
    process.exit(1);
  }
}

const passwordFile = process.env.MELEK_ADMIN_PASSWORD_FILE;
const adminPassword = passwordFile
  ? readPasswordFile(passwordFile)
  : (process.env.MELEK_ADMIN_PASSWORD || DEV_PASSWORD);

const config = {
  port: intFromEnv('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',

  /* Statik dosyaların kökü (index.html, css/, js/) */
  publicDir: ROOT,

  /* Veritabanı dosyası */
  databaseFile: process.env.MELEK_DB || path.join(ROOT, 'data', 'melek.db'),

  /* Yönetici şifresi */
  adminPassword,
  usingDefaultPassword: adminPassword === DEV_PASSWORD,

  /* Oturum süresi (saat) */
  sessionHours: intFromEnv('MELEK_SESSION_HOURS', 12),

  /* HTTPS arkasında çalışıyorsa çerez Secure işaretlensin */
  secureCookies: process.env.MELEK_SECURE_COOKIES === '1',

  /*
   * Ön yüz ayrı bir adreste barınıyorsa buraya o adresi yazın.
   * Örn: MELEK_ALLOWED_ORIGIN=https://melekguzellik.com
   * Boşsa yalnızca aynı sunucudan gelen istekler kabul edilir.
   */
  allowedOrigin: process.env.MELEK_ALLOWED_ORIGIN || '',

  /* Giriş denemesi sınırı */
  loginMaxAttempts: intFromEnv('MELEK_LOGIN_MAX_ATTEMPTS', 10),
  loginWindowMinutes: intFromEnv('MELEK_LOGIN_WINDOW_MINUTES', 15),

  /* Alan sınırları */
  maxNoteLength: 500,
  maxNameLength: 80
};

module.exports = config;
