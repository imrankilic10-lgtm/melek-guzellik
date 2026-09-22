/*
 * server/auth.js — Yönetici oturumu.
 *
 * Şifre ortam değişkeninden okunur, sabit zamanlı karşılaştırılır.
 * Başarılı girişte rastgele bir oturum anahtarı üretilip veritabanına
 * yazılır ve HttpOnly çerez olarak döner — şifre tarayıcıda tutulmaz.
 */
'use strict';

const crypto = require('crypto');

const db = require('./db.js');
const config = require('./config.js');

const COOKIE_NAME = 'melek_session';

/* --------------------------- şifre karşılaştırma ------------------------- */

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/* Uzunluk bilgisini sızdırmamak için önce özet alınır, sonra sabit zamanlı karşılaştırılır. */
function passwordMatches(candidate) {
  const a = digest(candidate);
  const b = digest(config.adminPassword);
  return crypto.timingSafeEqual(a, b);
}

/* ------------------------------ deneme sınırı ---------------------------- */

const attempts = new Map();   // ip -> { count, firstAt }

function rateLimitKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req) {
  const key = rateLimitKey(req);
  const entry = attempts.get(key);
  if (!entry) return false;

  const windowMs = config.loginWindowMinutes * 60 * 1000;
  if (Date.now() - entry.firstAt > windowMs) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= config.loginMaxAttempts;
}

function recordFailure(req) {
  const key = rateLimitKey(req);
  const entry = attempts.get(key);
  const windowMs = config.loginWindowMinutes * 60 * 1000;

  if (!entry || Date.now() - entry.firstAt > windowMs) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

function clearFailures(req) {
  attempts.delete(rateLimitKey(req));
}

/* -------------------------------- oturum --------------------------------- */

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionHours * 60 * 60 * 1000);

  db.get()
    .prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)')
    .run(token, now.toISOString(), expires.toISOString());

  purgeExpired();
  return { token, expires };
}

function purgeExpired() {
  db.get().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

function destroySession(token) {
  if (!token) return;
  db.get().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function parseCookies(header) {
  const jar = {};
  String(header || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    jar[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return jar;
}

function tokenFromRequest(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
}

function isSignedIn(req) {
  const token = tokenFromRequest(req);
  if (!token) return false;

  const row = db.get()
    .prepare('SELECT expires_at FROM sessions WHERE token = ?')
    .get(token);

  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(token);
    return false;
  }
  return true;
}

function cookieHeader(token, expires) {
  const parts = [
    COOKIE_NAME + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (expires) parts.push('Expires=' + expires.toUTCString());
  else parts.push('Max-Age=0');
  if (config.secureCookies) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  passwordMatches,
  isRateLimited,
  recordFailure,
  clearFailures,
  createSession,
  destroySession,
  tokenFromRequest,
  isSignedIn,
  cookieHeader
};
