/*
 * server/server.js — Melek Güzellik Salonu API sunucusu.
 *
 * Node'un yerleşik modülleriyle çalışır; dışarıdan paket kurulumu gerekmez.
 * Başlatma:  npm start
 */
'use strict';

const http = require('http');

const config = require('./config.js');
const db = require('./db.js');
const auth = require('./auth.js');
const appointments = require('./appointments.js');
const { sendJson, sendError, readJsonBody, serveStatic, corsHeaders } = require('./http-helpers.js');

const Data = require('../js/data.js');
const Booking = require('../js/booking.js');

/* ------------------------------ yardımcılar ------------------------------ */

function requireAuth(req, res) {
  if (auth.isSignedIn(req)) return true;
  sendError(req, res, 401, 'Bu işlem için giriş yapmanız gerekiyor.');
  return false;
}

function handleError(req, res, err) {
  const status = err && err.status;
  if (status && status < 500) {
    sendError(req, res, status, err.message, err.field);
    return;
  }
  console.error('[hata]', err);
  sendError(req, res, 500, 'Sunucu hatası. Lütfen tekrar deneyin.');
}

/* Müşteriye dönen randevu: yalnızca kendi kaydının bilgileri */
function publicView(appointment) {
  return {
    id: appointment.id,
    date: appointment.date,
    time: appointment.time,
    serviceLabel: appointment.serviceLabel,
    regions: appointment.regions,
    total: appointment.total,
    duration: appointment.duration,
    customerName: appointment.customerName
  };
}

/* --------------------------------- rotalar ------------------------------- */

const routes = [];

function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

/* --- genel --- */

route('GET', /^\/api\/health$/, (req, res) => {
  sendJson(req, res, 200, { ok: true, mode: 'api', version: 1 });
});

route('GET', /^\/api\/services$/, (req, res) => {
  sendJson(req, res, 200, {
    salon: Data.SALON,
    categories: Data.CATEGORIES,
    timeSlots: Data.TIME_SLOTS,
    bookableDays: Data.BOOKABLE_DAYS
  });
});

/*
 * Uygunluk — müşteri tarafının gördüğü tek randevu bilgisi.
 * Başkalarının adı, telefonu veya hizmeti DÖNMEZ.
 */
route('GET', /^\/api\/availability$/, (req, res, params, url) => {
  const date = url.searchParams.get('date') || '';
  const duration = url.searchParams.get('duration') || '30';
  const slots = appointments.availability(date, duration);
  sendJson(req, res, 200, { date, slots });
});

/* Günlerin listesi (kapalı gün bilgisiyle) */
route('GET', /^\/api\/days$/, (req, res) => {
  sendJson(req, res, 200, { days: Booking.buildDays(new Date(), Data.BOOKABLE_DAYS) });
});

/* Müşteri randevu oluşturma */
route('POST', /^\/api\/appointments$/, async (req, res) => {
  const body = await readJsonBody(req);
  const created = appointments.create(body, { source: 'web' });
  sendJson(req, res, 201, { appointment: publicView(created) });
});

/* --- yönetici oturumu --- */

route('POST', /^\/api\/admin\/login$/, async (req, res) => {
  if (auth.isRateLimited(req)) {
    sendError(req, res, 429, 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.');
    return;
  }

  const body = await readJsonBody(req);
  if (!auth.passwordMatches(body.passcode || '')) {
    auth.recordFailure(req);
    sendError(req, res, 401, 'Şifre hatalı. Lütfen tekrar deneyin.');
    return;
  }

  auth.clearFailures(req);
  const session = auth.createSession();
  sendJson(req, res, 200, { signedIn: true },
    { 'Set-Cookie': auth.cookieHeader(session.token, session.expires) });
});

route('POST', /^\/api\/admin\/logout$/, (req, res) => {
  auth.destroySession(auth.tokenFromRequest(req));
  sendJson(req, res, 200, { signedIn: false }, { 'Set-Cookie': auth.cookieHeader('', null) });
});

route('GET', /^\/api\/admin\/session$/, (req, res) => {
  sendJson(req, res, 200, { signedIn: auth.isSignedIn(req) });
});

/* --- yönetici verileri --- */

route('GET', /^\/api\/admin\/appointments$/, (req, res) => {
  if (!requireAuth(req, res)) return;
  sendJson(req, res, 200, {
    appointments: appointments.listAll(),
    stats: appointments.stats()
  });
});

route('POST', /^\/api\/admin\/appointments$/, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await readJsonBody(req);
  const created = appointments.create(body, { source: 'admin', allowFarFuture: true });
  sendJson(req, res, 201, { appointment: created });
});

route('PATCH', /^\/api\/admin\/appointments\/([\w-]+)$/, async (req, res, params) => {
  if (!requireAuth(req, res)) return;
  const body = await readJsonBody(req);
  const updated = appointments.updateStatus(params[1], body.status || null);
  if (!updated) { sendError(req, res, 404, 'Randevu bulunamadı.'); return; }
  sendJson(req, res, 200, { appointment: updated });
});

route('DELETE', /^\/api\/admin\/appointments\/([\w-]+)$/, (req, res, params) => {
  if (!requireAuth(req, res)) return;
  const removed = appointments.remove(params[1]);
  if (!removed) { sendError(req, res, 404, 'Randevu bulunamadı.'); return; }
  sendJson(req, res, 200, { deleted: true });
});

route('POST', /^\/api\/admin\/appointments\/import$/, async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await readJsonBody(req);
  const rows = Array.isArray(body) ? body : body.appointments;
  const count = appointments.replaceAll(rows);
  sendJson(req, res, 200, { restored: count });
});

/* --------------------------------- dağıtım -------------------------------- */

async function handle(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = url.pathname;

  /* CORS ön kontrol isteği */
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    const matched = routes.find((entry) =>
      entry.method === req.method && entry.pattern.test(pathname));

    if (!matched) {
      const pathExists = routes.some((entry) => entry.pattern.test(pathname));
      sendError(req, res, pathExists ? 405 : 404,
        pathExists ? 'Bu adres bu yöntemi desteklemiyor.' : 'Böyle bir adres yok.');
      return;
    }

    const params = matched.pattern.exec(pathname);
    await matched.handler(req, res, params, url);
    return;
  }

  /* Statik dosyalar */
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(req, res, 405, 'Bu adres bu yöntemi desteklemiyor.');
    return;
  }
  const served = serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
  if (!served) sendError(req, res, 404, 'Sayfa bulunamadı.');
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(() => handle(req, res))
    .catch((err) => {
      if (!res.headersSent) handleError(req, res, err);
      else res.end();
    });
});

/* -------------------------------- başlatma -------------------------------- */

function start() {
  db.open();

  server.listen(config.port, config.host, () => {
    const where = 'http://localhost:' + config.port;
    console.log('');
    console.log('  Melek Güzellik Salonu — randevu sunucusu');
    console.log('  ----------------------------------------');
    console.log('  Randevu sayfası : ' + where);
    console.log('  Yönetici paneli : ' + where + '/admin/');
    console.log('  Veritabanı      : ' + config.databaseFile);
    console.log('');

    if (config.usingDefaultPassword) {
      console.warn('  !! UYARI: Varsayılan yönetici şifresi kullanılıyor.');
      console.warn('     Yayına almadan önce MELEK_ADMIN_PASSWORD ayarlayın.');
      console.warn('');
    }
  });
}

function stop() {
  return new Promise((resolve) => {
    server.close(() => { db.close(); resolve(); });
  });
}

if (require.main === module) start();

module.exports = { server, start, stop };
