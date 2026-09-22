/*
 * store.js — Randevu deposu (MVP: localStorage)
 *
 * Tüm metotlar Promise döner. Böylece ileride localStorage yerine gerçek bir
 * backend (fetch/REST) kullanıldığında çağıran kodun değişmesi gerekmez:
 * sadece aşağıdaki LocalStorageAdapter yerine bir HttpAdapter yazılır ve
 * MelekStore.useAdapter(...) ile takılır.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'melekAppointments';

  /* localStorage erişilemezse (private mode, dosya kısıtı) bellek yedeğine düşeriz. */
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

  function MemoryAdapter(seed) {
    var rows = seed || [];
    this.readAll = function () { return rows.slice(); };
    this.writeAll = function (next) { rows = next.slice(); };
  }

  function LocalStorageAdapter() {
    this.readAll = function () {
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
        /* Bozuk veri uygulamayı kilitlemesin. */
        console.warn('melekAppointments okunamadı, sıfırlanıyor.', err);
        try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        return [];
      }
    };
    this.writeAll = function (rows) {
      try {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      } catch (err) {
        console.warn('Randevular kaydedilemedi.', err);
        throw new Error('Randevu kaydedilemedi. Tarayıcı depolaması kullanılamıyor.');
      }
    };
  }

  var adapter = storageAvailable() ? new LocalStorageAdapter() : new MemoryAdapter([]);

  function makeId() {
    return 'apt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      return 0;
    });
  }

  var MelekStore = {
    STORAGE_KEY: STORAGE_KEY,

    useAdapter: function (nextAdapter) { adapter = nextAdapter; },

    /* Tarih + saate göre sıralı tüm randevular */
    list: function () {
      return new Promise(function (resolve) {
        resolve(sortRows(adapter.readAll()));
      });
    },

    get: function (id) {
      return MelekStore.list().then(function (rows) {
        var found = rows.filter(function (row) { return row.id === id; })[0];
        return found || null;
      });
    },

    create: function (appointment) {
      return new Promise(function (resolve, reject) {
        try {
          var rows = adapter.readAll();
          var record = Object.assign({}, appointment, {
            id: appointment.id || makeId(),
            createdAt: appointment.createdAt || new Date().toISOString()
          });
          rows.push(record);
          adapter.writeAll(rows);
          resolve(record);
        } catch (err) {
          reject(err);
        }
      });
    },

    remove: function (id) {
      return new Promise(function (resolve, reject) {
        try {
          var rows = adapter.readAll();
          var next = rows.filter(function (row) { return row.id !== id; });
          adapter.writeAll(next);
          resolve(rows.length !== next.length);
        } catch (err) {
          reject(err);
        }
      });
    },

    clear: function () {
      return new Promise(function (resolve, reject) {
        try {
          adapter.writeAll([]);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      });
    }
  };

  global.MelekStore = MelekStore;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekStore;
})(typeof window !== 'undefined' ? window : globalThis);
