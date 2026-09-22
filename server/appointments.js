/*
 * server/appointments.js — Randevu veri erişimi ve iş kuralları.
 *
 * Hizmet katalogu ve kurallar ön yüzle aynı dosyalardan okunur
 * (js/data.js, js/booking.js) — böylece fiyat ve çakışma mantığı
 * tek bir yerde tanımlı kalır.
 */
'use strict';

const crypto = require('crypto');

const db = require('./db.js');
const config = require('./config.js');
const Data = require('../js/data.js');
const Booking = require('../js/booking.js');

/* ----------------------------- dönüştürme ------------------------------- */

function rowToAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    customerName: row.customer_name,
    phone: row.phone,
    note: row.note || '',
    date: row.date,
    time: row.time,
    serviceIds: JSON.parse(row.service_ids),
    services: JSON.parse(row.services),
    serviceLabel: row.service_label,
    regions: JSON.parse(row.regions),
    total: row.total,
    duration: row.duration,
    status: row.status || null,
    source: row.source
  };
}

function makeId() {
  return 'apt_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

/* ------------------------------ doğrulama -------------------------------- */

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.field = field;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.status = 409;
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/*
 * İstemciden gelen veriyi doğrular ve KAYDEDİLECEK randevuyu üretir.
 *
 * Fiyat, süre ve hizmet adları istemciden ALINMAZ; yalnızca hizmet
 * kimlikleri kabul edilip tutarlar sunucudaki katalogdan hesaplanır.
 */
function buildFromRequest(payload, options) {
  const opts = options || {};
  const body = payload || {};

  /* --- hizmetler --- */
  const requested = Array.isArray(body.serviceIds) ? body.serviceIds : [];
  if (!requested.length) {
    throw new ValidationError('Lütfen önce bir hizmet seçin.', 'serviceIds');
  }
  if (requested.length > 20) {
    throw new ValidationError('Çok fazla hizmet seçildi.', 'serviceIds');
  }

  const unique = [];
  requested.forEach((id) => {
    if (typeof id !== 'string' || unique.indexOf(id) !== -1) return;
    if (!Data.getService(id)) {
      throw new ValidationError('Geçersiz hizmet seçimi: ' + id, 'serviceIds');
    }
    unique.push(id);
  });
  if (!unique.length) {
    throw new ValidationError('Lütfen önce bir hizmet seçin.', 'serviceIds');
  }

  /* Kategori kurallarını sunucuda da uygula (Tüm Vücut, tek seçimli
     kategoriler): istemci atlasa bile kayıt tutarlı kalır. */
  const state = Booking.createState();
  unique.forEach((id) => {
    if (!Booking.isSelected(state, id)) Booking.toggleService(state, id);
  });

  /* --- tarih --- */
  const date = String(body.date || '');
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(date))) {
    throw new ValidationError('Geçerli bir tarih seçin.', 'date');
  }
  state.date = date;

  /* --- saat --- */
  const time = String(body.time || '');
  if (Data.TIME_SLOTS.indexOf(time) === -1) {
    throw new ValidationError('Geçerli bir saat seçin.', 'time');
  }
  state.time = time;

  const schedule = Booking.validateSchedule(state);
  if (!schedule.ok) throw new ValidationError(schedule.message, 'date');

  /* Geçmiş tarih/saate randevu alınamaz (yönetici de alamaz) */
  const today = Booking.toISODate(new Date());
  if (date < today) {
    throw new ValidationError('Geçmiş bir tarihe randevu oluşturulamaz.', 'date');
  }
  if (!opts.allowPast && Booking.isPastSlot(date, time, new Date())) {
    throw new ValidationError('Bu saat geçti. Lütfen başka bir saat seçin.', 'time');
  }

  /* Takvim penceresi dışına randevu alınmasın (yönetici muaf) */
  if (!opts.allowFarFuture) {
    const lastDay = Booking.buildDays(new Date(), Data.BOOKABLE_DAYS).slice(-1)[0].iso;
    if (date > lastDay) {
      throw new ValidationError('Bu tarih için henüz randevu alınamıyor.', 'date');
    }
  }

  /* --- müşteri --- */
  state.customer = {
    name: String(body.customerName || '').slice(0, config.maxNameLength),
    phone: String(body.phone || '').slice(0, 30),
    note: String(body.note || '').slice(0, config.maxNoteLength)
  };
  const customer = Booking.validateCustomer(state.customer);
  if (!customer.ok) throw new ValidationError(customer.message, customer.field);

  const appointment = Booking.buildAppointment(state);
  appointment.source = opts.source || 'web';
  return appointment;
}

/* ------------------------------- sorgular -------------------------------- */

function listAll() {
  return db.get()
    .prepare('SELECT * FROM appointments ORDER BY date ASC, time ASC')
    .all()
    .map(rowToAppointment);
}

function listByDate(date) {
  return db.get()
    .prepare('SELECT * FROM appointments WHERE date = ? ORDER BY time ASC')
    .all(date)
    .map(rowToAppointment);
}

function getById(id) {
  return rowToAppointment(
    db.get().prepare('SELECT * FROM appointments WHERE id = ?').get(id)
  );
}

/*
 * Bir günün saat listesini uygunluk bilgisiyle döner.
 * Müşteri tarafına yalnızca bu bilgi açılır — isim ve telefon sızmaz.
 */
function availability(date, durationMinutes) {
  if (!DATE_PATTERN.test(date)) {
    throw new ValidationError('Geçerli bir tarih seçin.', 'date');
  }
  const duration = Math.min(Math.max(Number(durationMinutes) || 30, 5), 600);
  const sameDay = listByDate(date);
  return Booking.buildSlots(date, sameDay, duration, new Date());
}

/* ------------------------------- yazma ----------------------------------- */

const INSERT_SQL = `
INSERT INTO appointments
  (id, created_at, customer_name, phone, note, date, time,
   service_ids, services, service_label, regions, total, duration, status, source)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

function insertRow(handle, appointment) {
  handle.prepare(INSERT_SQL).run(
    appointment.id,
    appointment.createdAt,
    appointment.customerName,
    appointment.phone,
    appointment.note || '',
    appointment.date,
    appointment.time,
    JSON.stringify(appointment.serviceIds),
    JSON.stringify(appointment.services),
    appointment.serviceLabel,
    JSON.stringify(appointment.regions),
    appointment.total,
    appointment.duration,
    appointment.status || null,
    appointment.source || 'web'
  );
}

/*
 * Randevuyu oluşturur. Çakışma kontrolü ile kayıt aynı işlem (transaction)
 * içinde yapılır; iki istek aynı anda gelse bile yalnızca biri kaydedilir.
 */
function create(payload, options) {
  const appointment = buildFromRequest(payload, options);

  return db.transaction((handle) => {
    const sameDay = handle
      .prepare('SELECT date, time, duration FROM appointments WHERE date = ?')
      .all(appointment.date);

    if (Booking.hasConflict(sameDay, appointment.date, appointment.time, appointment.duration)) {
      throw new ConflictError(Booking.CONFLICT_MESSAGE);
    }

    appointment.id = makeId();
    appointment.createdAt = new Date().toISOString();
    appointment.status = null;
    insertRow(handle, appointment);
    return appointment;
  });
}

const ALLOWED_STATUS = [null, 'done', 'no-show'];

function updateStatus(id, status) {
  if (ALLOWED_STATUS.indexOf(status === undefined ? null : status) === -1) {
    throw new ValidationError('Geçersiz durum değeri.', 'status');
  }
  const result = db.get()
    .prepare('UPDATE appointments SET status = ? WHERE id = ?')
    .run(status || null, id);
  return result.changes ? getById(id) : null;
}

function remove(id) {
  const result = db.get().prepare('DELETE FROM appointments WHERE id = ?').run(id);
  return result.changes > 0;
}

/*
 * Yedekten geri yükleme: mevcut kayıtların tamamını değiştirir.
 * Yedekteki fiyat ve süreler korunur (geçmiş kayıtlar olduğu gibi kalmalı).
 */
function replaceAll(rows) {
  if (!Array.isArray(rows)) {
    throw new ValidationError('Yedek dosyası beklenen biçimde değil.');
  }
  if (rows.length > 20000) {
    throw new ValidationError('Yedek dosyası çok büyük.');
  }

  const clean = rows
    .filter((row) => row && DATE_PATTERN.test(String(row.date)) && row.time)
    .map((row) => ({
      id: typeof row.id === 'string' && row.id ? row.id : makeId(),
      createdAt: row.createdAt || new Date().toISOString(),
      customerName: String(row.customerName || '—').slice(0, config.maxNameLength),
      phone: String(row.phone || '').slice(0, 30),
      note: String(row.note || '').slice(0, config.maxNoteLength),
      date: String(row.date),
      time: String(row.time),
      serviceIds: Array.isArray(row.serviceIds) ? row.serviceIds : [],
      services: Array.isArray(row.services) ? row.services : [],
      serviceLabel: String(row.serviceLabel || ''),
      regions: Array.isArray(row.regions) ? row.regions : [],
      total: Number(row.total) || 0,
      duration: Number(row.duration) || 30,
      status: ALLOWED_STATUS.indexOf(row.status || null) === -1 ? null : (row.status || null),
      source: row.source === 'admin' ? 'admin' : 'web'
    }));

  return db.transaction((handle) => {
    handle.prepare('DELETE FROM appointments').run();
    const seen = new Set();
    clean.forEach((row) => {
      if (seen.has(row.id)) row.id = makeId();
      seen.add(row.id);
      insertRow(handle, row);
    });
    return clean.length;
  });
}

function stats() {
  const today = Booking.toISODate(new Date());
  const handle = db.get();
  const todayRows = handle
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue FROM appointments WHERE date = ?')
    .get(today);
  const upcoming = handle
    .prepare('SELECT COUNT(*) AS count FROM appointments WHERE date >= ?')
    .get(today);
  const all = handle.prepare('SELECT COUNT(*) AS count FROM appointments').get();

  return {
    today: todayRows.count,
    todayRevenue: todayRows.revenue,
    upcoming: upcoming.count,
    all: all.count
  };
}

module.exports = {
  ValidationError,
  ConflictError,
  buildFromRequest,
  listAll,
  listByDate,
  getById,
  availability,
  create,
  updateStatus,
  remove,
  replaceAll,
  stats
};
