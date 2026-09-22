/*
 * store.js — Veri katmanı.
 *
 * İki modda çalışır:
 *   'api'   → Backend sunucusu çalışıyorsa (npm start). Randevular
 *             veritabanında tutulur, tüm cihazlar aynı veriyi görür.
 *   'local' → Sunucu yoksa (dosyayı doğrudan açma / statik hosting).
 *             Randevular yalnızca o tarayıcıda, localStorage'da tutulur.
 *
 * Mod başlangıçta /api/health yoklanarak otomatik belirlenir.
 * Çağıran kod (app.js, admin.js) hangi modda olduğunu bilmek zorunda değildir.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'melekAppointments';
  var SESSION_KEY = 'melekAdminSession';

  var MODE_KEY = 'melekMode';
  var mode = 'local';
  var apiBase = '';
  var ready = null;

  function Booking() { return global.MelekBooking; }
  function Config() { return global.MelekConfig; }

  /* ===================== localStorage yardımcıları ====================== */

  function storageAvailable() {
    try {
      var probe = '__melek_test__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  var memoryRows = [];
  var hasStorage = storageAvailable();

  function readAll() {
    if (!hasStorage) return memoryRows.slice();
    var raw;
    try {
      raw = global.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return [];
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('melekAppointments okunamadı, sıfırlanıyor.', err);
      try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* yoksayılır */ }
      return [];
    }
  }

  function writeAll(rows) {
    if (!hasStorage) { memoryRows = rows.slice(); return; }
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch (err) {
      console.warn('Randevular kaydedilemedi.', err);
      throw new Error('Randevu kaydedilemedi. Tarayıcı depolaması kullanılamıyor.');
    }
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      return 0;
    });
  }

  function makeId() {
    return 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* =========================== API yardımcıları ========================= */

  function ApiError(message, field, status) {
    var error = new Error(message);
    error.field = field;
    error.status = status;
    return error;
  }

  function request(method, path, body) {
    var options = {
      method: method,
      credentials: 'same-origin',
      headers: {}
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    return fetch(apiBase + path, options).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }

        if (!response.ok) {
          var message = (data && data.error) || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
          throw ApiError(message, data && data.field, response.status);
        }
        return data;
      });
    });
  }

  /* ============================ başlatma =============================== */

  /*
   * Sunucu var mı diye bakar. Yanıt gelmezse (statik hosting, file://)
   * sessizce yerel moda düşülür — uygulama her iki durumda da çalışır.
   */
  /* Mod sekme başına bir kez belirlenir, sonra önbellekten okunur */
  function cachedMode() {
    try {
      return global.sessionStorage.getItem(MODE_KEY);
    } catch (err) {
      return null;
    }
  }

  function cacheMode(value) {
    try {
      global.sessionStorage.setItem(MODE_KEY, value);
    } catch (err) { /* yoksayılır */ }
  }

  function init() {
    if (ready) return ready;

    if (typeof fetch !== 'function' || global.location.protocol === 'file:') {
      mode = 'local';
      ready = Promise.resolve(mode);
      return ready;
    }

    var remembered = cachedMode();
    if (remembered === 'api' || remembered === 'local') {
      mode = remembered;
      ready = Promise.resolve(mode);
      return ready;
    }

    var timeout = new Promise(function (resolve) {
      global.setTimeout(function () { resolve(null); }, 3000);
    });

    ready = Promise.race([
      fetch(apiBase + '/api/health', { credentials: 'same-origin' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .catch(function () { return null; }),
      timeout
    ]).then(function (health) {
      mode = (health && health.mode === 'api') ? 'api' : 'local';
      cacheMode(mode);
      return mode;
    });

    return ready;
  }

  /* ======================== müşteri tarafı işlemler ===================== */

  /* Bir günün saat listesini uygunluk bilgisiyle döner */
  function getSlots(date, durationMinutes) {
    return init().then(function () {
      if (mode === 'api') {
        return request('GET', '/api/availability?date=' + encodeURIComponent(date) +
          '&duration=' + encodeURIComponent(durationMinutes || 30))
          .then(function (data) { return data.slots; });
      }
      return Booking().buildSlots(date, readAll(), durationMinutes || 30, new Date());
    });
  }

  /*
   * Randevu oluşturur.
   * payload: { serviceIds, date, time, customerName, phone, note }
   * Fiyat ve süre API modunda sunucuda hesaplanır.
   */
  function createAppointment(payload) {
    return init().then(function () {
      if (mode === 'api') {
        return request('POST', '/api/appointments', payload)
          .then(function (data) { return data.appointment; });
      }
      return createLocal(payload, 'web');
    });
  }

  function createLocal(payload, source) {
    var state = Booking().createState();
    (payload.serviceIds || []).forEach(function (id) {
      if (!Booking().isSelected(state, id)) Booking().toggleService(state, id);
    });
    state.date = payload.date;
    state.time = payload.time;
    state.customer = {
      name: payload.customerName,
      phone: payload.phone,
      note: payload.note || ''
    };

    var rows = readAll();
    var appointment = Booking().buildAppointment(state);

    if (Booking().hasConflict(rows, appointment.date, appointment.time, appointment.duration)) {
      throw ApiError(Booking().CONFLICT_MESSAGE, 'time', 409);
    }

    appointment.id = makeId();
    appointment.createdAt = new Date().toISOString();
    appointment.status = null;
    appointment.source = source || 'web';
    rows.push(appointment);
    writeAll(rows);
    return appointment;
  }

  /* ========================== yönetici işlemleri ======================== */

  function localSessionSet(value) {
    try {
      if (value) global.sessionStorage.setItem(SESSION_KEY, 'ok');
      else global.sessionStorage.removeItem(SESSION_KEY);
    } catch (err) { /* sessionStorage kapalıysa oturum sayfa ömrü kadar sürer */ }
  }

  function localSessionGet() {
    try {
      return global.sessionStorage.getItem(SESSION_KEY) === 'ok';
    } catch (err) {
      return false;
    }
  }

  var admin = {
    login: function (passcode) {
      return init().then(function () {
        if (mode === 'api') {
          return request('POST', '/api/admin/login', { passcode: passcode })
            .then(function () { return true; });
        }
        if (String(passcode) !== String(Config().adminPasscode)) {
          throw ApiError('Şifre hatalı. Lütfen tekrar deneyin.', 'passcode', 401);
        }
        localSessionSet(true);
        return true;
      });
    },

    logout: function () {
      return init().then(function () {
        if (mode === 'api') {
          return request('POST', '/api/admin/logout').then(function () { return true; });
        }
        localSessionSet(false);
        return true;
      });
    },

    session: function () {
      return init().then(function () {
        if (mode === 'api') {
          return request('GET', '/api/admin/session')
            .then(function (data) { return !!(data && data.signedIn); })
            .catch(function () { return false; });
        }
        return localSessionGet();
      });
    },

    list: function () {
      return init().then(function () {
        if (mode === 'api') return request('GET', '/api/admin/appointments');
        var rows = sortRows(readAll());
        return { appointments: rows, stats: localStats(rows) };
      });
    },

    create: function (payload) {
      return init().then(function () {
        if (mode === 'api') {
          return request('POST', '/api/admin/appointments', payload)
            .then(function (data) { return data.appointment; });
        }
        return createLocal(payload, 'admin');
      });
    },

    updateStatus: function (id, status) {
      return init().then(function () {
        if (mode === 'api') {
          return request('PATCH', '/api/admin/appointments/' + encodeURIComponent(id),
            { status: status })
            .then(function (data) { return data.appointment; });
        }
        var rows = readAll();
        var updated = null;
        var next = rows.map(function (row) {
          if (row.id !== id) return row;
          updated = Object.assign({}, row, { status: status || null });
          return updated;
        });
        if (!updated) return null;
        writeAll(next);
        return updated;
      });
    },

    remove: function (id) {
      return init().then(function () {
        if (mode === 'api') {
          return request('DELETE', '/api/admin/appointments/' + encodeURIComponent(id))
            .then(function () { return true; });
        }
        var rows = readAll();
        var next = rows.filter(function (row) { return row.id !== id; });
        writeAll(next);
        return rows.length !== next.length;
      });
    },

    replaceAll: function (rows) {
      return init().then(function () {
        if (mode === 'api') {
          return request('POST', '/api/admin/appointments/import', { appointments: rows })
            .then(function (data) { return data.restored; });
        }
        if (!Array.isArray(rows)) throw new Error('Yedek dosyası okunamadı.');
        var clean = rows.filter(function (row) { return row && row.date && row.time; })
          .map(function (row) { return Object.assign({}, row, { id: row.id || makeId() }); });
        writeAll(clean);
        return clean.length;
      });
    }
  };

  function localStats(rows) {
    var today = Booking().toISODate(new Date());
    var todayRows = rows.filter(function (r) { return r.date === today; });
    return {
      today: todayRows.length,
      todayRevenue: todayRows.reduce(function (sum, r) { return sum + (r.total || 0); }, 0),
      upcoming: rows.filter(function (r) { return r.date >= today; }).length,
      all: rows.length
    };
  }

  /* ================================ dışa ============================== */

  var MelekStore = {
    STORAGE_KEY: STORAGE_KEY,
    init: init,
    getMode: function () { return mode; },
    isApi: function () { return mode === 'api'; },
    getSlots: getSlots,
    createAppointment: createAppointment,
    admin: admin,

    /* Testler ve yerel mod için */
    _readAll: readAll,
    _writeAll: writeAll
  };

  global.MelekStore = MelekStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekStore;
})(typeof window !== 'undefined' ? window : globalThis);
