/*
 * server/http-helpers.js — İstek/yanıt yardımcıları.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config.js');

const MAX_BODY_BYTES = 1024 * 1024 * 2;   /* 2 MB — yedek geri yükleme için */

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ics': 'text/calendar; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  };
}

function corsHeaders(req) {
  if (!config.allowedOrigin) return {};
  const origin = req.headers.origin;
  if (origin !== config.allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': config.allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function sendJson(req, res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload === undefined ? null : payload);
  res.writeHead(status, Object.assign(
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store'
    },
    securityHeaders(),
    corsHeaders(req),
    extraHeaders || {}
  ));
  res.end(body);
}

function sendError(req, res, status, message, field) {
  const payload = { error: message };
  if (field) payload.field = field;
  sendJson(req, res, status, payload);
}

/* Gövdeyi JSON olarak okur; boyut sınırını aşarsa isteği reddeder. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('Gönderilen veri çok büyük.');
        err.status = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        const parseError = new Error('Geçersiz JSON gövdesi.');
        parseError.status = 400;
        reject(parseError);
      }
    });

    req.on('error', reject);
  });
}

/* ---------------------------- statik dosyalar ---------------------------- */

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(config.publicDir, relative);

  /* Kök dizinin dışına çıkan yolları reddet (path traversal) */
  if (resolved !== config.publicDir && !resolved.startsWith(config.publicDir + path.sep)) {
    return null;
  }
  return resolved;
}

const BLOCKED_PREFIXES = ['data', 'server', 'tests', 'node_modules', '.git'];

function isBlocked(filePath) {
  const relative = path.relative(config.publicDir, filePath).split(path.sep)[0];
  return BLOCKED_PREFIXES.indexOf(relative) !== -1 || relative.startsWith('.');
}

function serveStatic(req, res, urlPath) {
  let filePath = safeFilePath(urlPath);
  if (!filePath) { sendError(req, res, 400, 'Geçersiz yol.'); return true; }

  if (isBlocked(filePath)) { sendError(req, res, 404, 'Bulunamadı.'); return true; }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return false;
  }

  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      return false;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';

  res.writeHead(200, Object.assign({
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=300'
  }, securityHeaders()));

  fs.createReadStream(filePath).pipe(res);
  return true;
}

module.exports = {
  sendJson,
  sendError,
  readJsonBody,
  serveStatic,
  corsHeaders,
  securityHeaders
};
