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

  /* Müşteriye gösterilecek gün listesi (bugünden itibaren) */
  function buildDays(today, count) {
    var base = today || new Date();
    var total = count || Data.BOOKABLE_DAYS;
    var days = [];
    for (var i = 0; i < total; i++) {
      var date = addDays(base, i);
      days.push({
        iso: toISODate(date),
        dayNumber: date.getDate(),
        weekday: Data.WEEKDAYS_SHORT[date.getDay()],
        month: Data.MONTHS_SHORT[date.getMonth()],
        isToday: i === 0
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
      customer: { name: '', phone: '' }
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

  function isPastSlot(dateISO, time, now) {
    var reference = now || new Date();
    if (dateISO !== toISODate(reference)) return false;
    var minutesNow = reference.getHours() * 60 + reference.getMinutes();
    return timeToMinutes(time) <= minutesNow;
  }

  /* Bir gün için saat listesini uygunluk bilgisiyle döner */
  function buildSlots(dateISO, appointments, durationMinutes, now) {
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
    formatPrice: formatPrice,
    CONFLICT_MESSAGE: 'Bu saat için başka bir randevu bulunuyor. Lütfen farklı bir saat seçin.'
  };

  global.MelekBooking = MelekBooking;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekBooking;
})(typeof window !== 'undefined' ? window : globalThis);
