/*
 * booking.js — Randevu akışının saf iş mantığı.
 * DOM'a dokunmaz; bu sayede hem tarayıcıda hem Node üzerinde test edilebilir.
 */
(function (global) {
  'use strict';

  var Data = global.MelekData || (typeof require !== 'undefined' ? require('./data.js') : null);

  /* ---------- Tarih / saat yardımcıları ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Yerel saate göre YYYY-MM-DD (toISOString UTC kaydığı için kullanılmaz) */
  function toISODate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseISODate(iso) {
    var parts = String(iso).split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function timeToMinutes(time) {
    var parts = String(time).split(':');
    return Number(parts[0]) * 60 + Number(parts[1]);
  }

  function addDays(date, days) {
    var next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
  }

  function formatDateLong(iso) {
    var date = parseISODate(iso);
    return date.getDate() + ' ' + Data.MONTHS_LONG[date.getMonth()] + ' ' + date.getFullYear() +
      ', ' + Data.WEEKDAYS_SHORT[date.getDay()];
  }

  function formatPrice(amount) {
    return String(amount) + ' TL';
  }

  /* Salon o gün kapalı mı? (haftalık izin günü veya tatil tarihi) */
  function isDayClosed(dateISO) {
    var config = Data.CONFIG;
    if ((config.closedDates || []).indexOf(dateISO) !== -1) return true;
    var weekday = parseISODate(dateISO).getDay();
    return (config.closedWeekdays || []).indexOf(weekday) !== -1;
  }

  /* Müşteriye gösterilecek gün listesi (bugünden itibaren) */
  function buildDays(today, count) {
    var base = today || new Date();
    var total = count || Data.BOOKABLE_DAYS;
    var days = [];
    for (var i = 0; i < total; i++) {
      var date = addDays(base, i);
      var iso = toISODate(date);
      days.push({
        iso: iso,
        dayNumber: date.getDate(),
        weekday: Data.WEEKDAYS_SHORT[date.getDay()],
        month: Data.MONTHS_SHORT[date.getMonth()],
        isToday: i === 0,
        closed: isDayClosed(iso)
      });
    }
    return days;
  }

  /* ---------- Seçim durumu ---------- */

  function createState() {
    return {
      serviceIds: [],
      date: null,
      time: null,
      customer: { name: '', phone: '', note: '' }
    };
  }

  function isSelected(state, serviceId) {
    return state.serviceIds.indexOf(serviceId) !== -1;
  }

  /*
   * Hizmet seçimini değiştirir ve kategori kurallarını uygular:
   *  - 'single' kategoride yeni seçim öncekini değiştirir
   *  - exclusive hizmet (Tüm Vücut) seçilince kategorideki diğerleri kalkar
   *  - exclusive seçiliyken başka bir bölge seçilince exclusive kalkar
   */
  function toggleService(state, serviceId) {
    var category = Data.getCategoryOfService(serviceId);
    if (!category) return state;

    if (isSelected(state, serviceId)) {
      state.serviceIds = state.serviceIds.filter(function (id) { return id !== serviceId; });
      return state;
    }

    var service = Data.getService(serviceId);
    var exclusiveIds = category.services
      .filter(function (item) { return item.exclusive; })
      .map(function (item) { return item.id; });

    if (category.selection === 'single' || service.exclusive) {
      /* Bu kategorideki tüm seçimleri temizle */
      state.serviceIds = state.serviceIds.filter(function (id) {
        return Data.getCategoryOfService(id).id !== category.id;
      });
    } else if (exclusiveIds.length) {
      /* Normal bir bölge seçildi: exclusive seçim (Tüm Vücut) kalksın */
      state.serviceIds = state.serviceIds.filter(function (id) {
        return exclusiveIds.indexOf(id) === -1;
      });
    }

    state.serviceIds.push(serviceId);
    return state;
  }

  function getSelectedServices(state) {
    return state.serviceIds.map(function (id) {
      var service = Data.getService(id);
      var category = Data.getCategoryOfService(id);
      return {
        id: service.id,
        name: service.name,
        price: service.price,
        duration: service.duration,
        categoryId: category.id,
        categoryName: category.name
      };
    });
  }

  function getTotal(state) {
    return getSelectedServices(state).reduce(function (sum, item) { return sum + item.price; }, 0);
  }

  function getDuration(state) {
    return getSelectedServices(state).reduce(function (sum, item) { return sum + item.duration; }, 0);
  }

  /*
   * Özet satırları:
   *  Hizmet  -> Lazer seçiliyse "Lazer Epilasyon", diğerlerinde hizmet adları
   *  Bölgeler -> yalnızca lazer seçimi varsa
   */
  function getSummary(state) {
    var selected = getSelectedServices(state);
    var serviceLabels = [];
    var regions = [];
    var seenCategories = [];

    selected.forEach(function (item) {
      if (item.categoryId === 'lazer') {
        if (seenCategories.indexOf('lazer') === -1) {
          seenCategories.push('lazer');
          serviceLabels.push(item.categoryName);
        }
        regions.push(item.name);
      } else {
        serviceLabels.push(item.name);
      }
    });

    return {
      services: selected,
      serviceLabel: serviceLabels.join(', '),
      regions: regions,
      total: getTotal(state),
      duration: getDuration(state)
    };
  }

  /* ---------- Uygunluk / çakışma ---------- */

  /*
   * Tek personel çalıştığı için aynı anda tek randevu olabilir.
   * Yeni randevunun [start, start+duration) aralığı mevcut bir randevuyla
   * kesişiyorsa saat dolu sayılır.
   */
  function hasConflict(appointments, dateISO, time, durationMinutes) {
    var start = timeToMinutes(time);
    var end = start + (durationMinutes || 30);

    return (appointments || []).some(function (appointment) {
      if (appointment.date !== dateISO) return false;
      var otherStart = timeToMinutes(appointment.time);
      var otherEnd = otherStart + (appointment.duration || 30);
      return start < otherEnd && otherStart < end;
    });
  }

  /*
   * Saat geçmiş mi? config.minimumNoticeMinutes kadar da öne tampon konur
   * (ör. 60 -> en erken bir saat sonrasına randevu verilebilir).
   */
  function isPastSlot(dateISO, time, now) {
    var reference = now || new Date();
    if (dateISO !== toISODate(reference)) return false;
    var notice = Data.CONFIG.minimumNoticeMinutes || 0;
    var minutesNow = reference.getHours() * 60 + reference.getMinutes();
    return timeToMinutes(time) <= minutesNow + notice;
  }

  /* Bir gün için saat listesini uygunluk bilgisiyle döner */
  function buildSlots(dateISO, appointments, durationMinutes, now) {
    if (isDayClosed(dateISO)) {
      return Data.TIME_SLOTS.map(function (time) {
        return { time: time, available: false, reason: 'closed' };
      });
    }
    return Data.TIME_SLOTS.map(function (time) {
      var past = isPastSlot(dateISO, time, now);
      var busy = hasConflict(appointments, dateISO, time, durationMinutes);
      return {
        time: time,
        available: !past && !busy,
        reason: past ? 'past' : (busy ? 'busy' : null)
      };
    });
  }

  /* ---------- Doğrulama ---------- */

  function validateServices(state) {
    if (!state.serviceIds.length) {
      return { ok: false, message: 'Lütfen önce bir hizmet seçin.' };
    }
    return { ok: true };
  }

  function validateSchedule(state) {
    if (!state.date) return { ok: false, message: 'Lütfen bir tarih seçin.' };
    if (isDayClosed(state.date)) {
      return { ok: false, message: 'Salonumuz bu tarihte kapalıdır. Lütfen başka bir gün seçin.' };
    }
    if (!state.time) return { ok: false, message: 'Lütfen bir saat seçin.' };
    return { ok: true };
  }

  function normalizePhone(value) {
    return String(value || '').replace(/[^0-9+]/g, '');
  }

  function validateCustomer(customer) {
    var name = String(customer && customer.name || '').trim();
    var phone = normalizePhone(customer && customer.phone);
    var digits = phone.replace(/\D/g, '');

    if (name.length < 3) {
      return { ok: false, field: 'name', message: 'Lütfen ad ve soyadınızı girin.' };
    }
    if (!digits.length) {
      return { ok: false, field: 'phone', message: 'Lütfen telefon numaranızı girin.' };
    }
    if (digits.length < 10) {
      return { ok: false, field: 'phone', message: 'Telefon numarası en az 10 haneli olmalıdır.' };
    }
    return { ok: true };
  }

  /* Kaydedilecek randevu nesnesi (depolama katmanından bağımsız) */
  function buildAppointment(state) {
    var summary = getSummary(state);
    return {
      customerName: String(state.customer.name || '').trim(),
      phone: normalizePhone(state.customer.phone),
      note: String(state.customer.note || '').trim(),
      date: state.date,
      time: state.time,
      serviceIds: state.serviceIds.slice(),
      services: summary.services,
      serviceLabel: summary.serviceLabel,
      regions: summary.regions,
      total: summary.total,
      duration: summary.duration
    };
  }

  /* ---------- Takvim dosyası (.ics) ---------- */

  function icsEscape(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /* Yerel saati takvim biçimine çevirir: 20261010T140000 */
  function icsLocalStamp(dateISO, minutesFromMidnight) {
    var date = parseISODate(dateISO);
    date.setMinutes(date.getMinutes() + minutesFromMidnight);
    return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
      'T' + pad2(date.getHours()) + pad2(date.getMinutes()) + '00';
  }

  function icsUtcStamp(date) {
    return date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
      'T' + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes()) + pad2(date.getUTCSeconds()) + 'Z';
  }

  /*
   * Randevuyu telefonun takvimine eklemek için .ics içeriği üretir.
   * Saat dilimi bilgisi yazılmaz; cihazın yerel saati kullanılır.
   */
  function buildICS(appointment) {
    var salon = Data.SALON;
    var start = timeToMinutes(appointment.time);
    var duration = appointment.duration || 30;

    var details = [salon.name, 'Hizmet: ' + (appointment.serviceLabel || '')];
    if (appointment.regions && appointment.regions.length) {
      details.push('Bölgeler: ' + appointment.regions.join(', '));
    }
    details.push('Toplam: ' + formatPrice(appointment.total || 0));
    details.push('Telefon: ' + salon.phoneDisplay);

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Melek Guzellik Salonu//Randevu//TR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + (appointment.id || 'randevu') + '@melekguzellik',
      'DTSTAMP:' + icsUtcStamp(new Date()),
      'DTSTART:' + icsLocalStamp(appointment.date, start),
      'DTEND:' + icsLocalStamp(appointment.date, start + duration),
      'SUMMARY:' + icsEscape(salon.name + ' — ' + (appointment.serviceLabel || 'Randevu')),
      'DESCRIPTION:' + icsEscape(details.join('\n')),
      'LOCATION:' + icsEscape(salon.name),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  /* Süreyi okunur hale getirir: 90 -> "1 sa 30 dk" */
  function formatDuration(minutes) {
    var total = Number(minutes) || 0;
    if (total < 60) return total + ' dk';
    var hours = Math.floor(total / 60);
    var rest = total % 60;
    return rest ? hours + ' sa ' + rest + ' dk' : hours + ' sa';
  }

  /* Randevunun bitiş saati: "14:00" + 45 -> "14:45" */
  function endTime(time, duration) {
    var total = timeToMinutes(time) + (Number(duration) || 0);
    return pad2(Math.floor(total / 60) % 24) + ':' + pad2(total % 60);
  }

  /* Kısa tarih: 2026-10-10 -> "10 Eki 2026" */
  function formatDateShort(iso) {
    var date = parseISODate(iso);
    return date.getDate() + ' ' + Data.MONTHS_SHORT[date.getMonth()] + ' ' + date.getFullYear();
  }

  var MelekBooking = {
    createState: createState,
    isSelected: isSelected,
    toggleService: toggleService,
    getSelectedServices: getSelectedServices,
    getTotal: getTotal,
    getDuration: getDuration,
    getSummary: getSummary,
    hasConflict: hasConflict,
    isPastSlot: isPastSlot,
    buildSlots: buildSlots,
    buildDays: buildDays,
    validateServices: validateServices,
    validateSchedule: validateSchedule,
    validateCustomer: validateCustomer,
    buildAppointment: buildAppointment,
    normalizePhone: normalizePhone,
    toISODate: toISODate,
    parseISODate: parseISODate,
    timeToMinutes: timeToMinutes,
    addDays: addDays,
    formatDateLong: formatDateLong,
    formatDateShort: formatDateShort,
    formatPrice: formatPrice,
    formatDuration: formatDuration,
    endTime: endTime,
    isDayClosed: isDayClosed,
    buildICS: buildICS,
    CONFLICT_MESSAGE: 'Bu saat için başka bir randevu bulunuyor. Lütfen farklı bir saat seçin.'
  };

  global.MelekBooking = MelekBooking;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekBooking;
})(typeof window !== 'undefined' ? window : globalThis);
