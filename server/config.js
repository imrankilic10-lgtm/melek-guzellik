/*
 * server/config.js — Sunucu ayarları.
 * Tüm hassas değerler ortam değişkeninden (environment variable) okunur.
 */
'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..');

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

const DEV_PASSWORD = 'melek2026';
const adminPassword = process.env.MELEK_ADMIN_PASSWORD || DEV_PASSWORD;

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
