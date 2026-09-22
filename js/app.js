/*
 * app.js — Müşteri randevu akışının arayüz denetleyicisi.
 * İş mantığı booking.js'te, veri erişimi store.js'tedir.
 */
(function () {
  'use strict';

  var Data = window.MelekData;
  var Booking = window.MelekBooking;
  var Store = window.MelekStore;

  var state = Booking.createState();
  var currentStep = 1;
  var appointments = [];   /* çakışma kontrolü için mevcut randevular */
  var lastAppointment = null;

  var el = {};

  /* --------------------------- Yardımcılar ------------------------------ */

  function $(id) { return document.getElementById(id); }

  function cacheElements() {
    ['stepper', 'notice', 'categories', 'days', 'slots', 'time-hint', 'summary',
     'confirm-summary', 'customer-form', 'customer-name', 'customer-phone',
     'btn-next', 'btn-back', 'total-price', 'total-bar', 'actionbar',
     'new-appointment'].forEach(function (id) {
      el[id] = $(id);
    });
    el.steps = [1, 2, 3, 4].map(function (n) { return $('step-' + n); });
  }

  function showNotice(message, kind) {
    el.notice.textContent = message;
    el.notice.className = 'notice' + (kind === 'ok' ? ' is-ok' : '');
    el.notice.hidden = false;
  }

  function clearNotice() {
    el.notice.hidden = true;
    el.notice.textContent = '';
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function createEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /* ------------------------ Adım 1: hizmetler --------------------------- */

  function renderCategories() {
    var fragment = document.createDocumentFragment();

    Data.CATEGORIES.forEach(function (category) {
      var section = createEl('section', 'category');

      var head = createEl('div', 'category__head');
      head.appendChild(createEl('h3', 'category__title', category.name));
      if (category.note) head.appendChild(createEl('p', 'category__note', category.note));
      section.appendChild(head);

      var list = createEl('div', 'options');
      category.services.forEach(function (service) {
        var button = createEl('button',
          'option' + (category.selection === 'single' ? ' option--single' : ''));
        button.type = 'button';
        button.dataset.serviceId = service.id;
        button.setAttribute('aria-pressed', 'false');

        var main = createEl('div', 'option__main');
        var mark = createEl('span', 'option__mark', '✓');
        mark.setAttribute('aria-hidden', 'true');
        main.appendChild(mark);
        main.appendChild(createEl('span', 'option__name', service.name));
        button.appendChild(main);
        button.appendChild(createEl('span', 'option__price', Booking.formatPrice(service.price)));

        list.appendChild(button);
      });
      section.appendChild(list);
      fragment.appendChild(section);
    });

    el.categories.innerHTML = '';
    el.categories.appendChild(fragment);
  }

  function syncServiceButtons() {
    var buttons = el.categories.querySelectorAll('.option');
    Array.prototype.forEach.call(buttons, function (button) {
      var selected = Booking.isSelected(state, button.dataset.serviceId);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  function onServiceClick(event) {
    var button = event.target.closest('.option');
    if (!button) return;

    Booking.toggleService(state, button.dataset.serviceId);
    syncServiceButtons();
    updateTotal();
    clearNotice();

    /* Süre değişince seçili saat geçersiz kalabilir */
    if (state.time && Booking.hasConflict(appointments, state.date, state.time, Booking.getDuration(state))) {
      state.time = null;
    }
  }

  function updateTotal() {
    el['total-price'].textContent = Booking.formatPrice(Booking.getTotal(state));
  }

  /* ------------------------ Adım 2: tarih & saat ------------------------ */

  function renderDays() {
    var days = Booking.buildDays(new Date(), Data.BOOKABLE_DAYS);
    var fragment = document.createDocumentFragment();

    days.forEach(function (day) {
      var button = createEl('button', 'day');
      button.type = 'button';
      button.dataset.date = day.iso;
      button.setAttribute('aria-pressed', state.date === day.iso ? 'true' : 'false');
      button.setAttribute('aria-label', Booking.formatDateLong(day.iso));

      button.appendChild(createEl('span', 'day__weekday', day.isToday ? 'Bugün' : day.weekday));
      button.appendChild(createEl('span', 'day__num', String(day.dayNumber)));
      button.appendChild(createEl('span', 'day__month', day.month));
      fragment.appendChild(button);
    });

    el.days.innerHTML = '';
    el.days.appendChild(fragment);
  }

  function renderSlots() {
    el.slots.innerHTML = '';

    if (!state.date) {
      el['time-hint'].hidden = false;
      el['time-hint'].textContent = 'Saatleri görmek için önce bir tarih seçin.';
      return;
    }

    var duration = Booking.getDuration(state);
    var slots = Booking.buildSlots(state.date, appointments, duration, new Date());
    var openCount = slots.filter(function (slot) { return slot.available; }).length;

    el['time-hint'].hidden = openCount > 0;
    if (!openCount) {
      el['time-hint'].textContent = 'Bu gün için uygun saat kalmadı. Lütfen başka bir gün seçin.';
    }

    var fragment = document.createDocumentFragment();
    slots.forEach(function (slot) {
      var button = createEl('button', 'slot', slot.time);
      button.type = 'button';
      button.dataset.time = slot.time;
      button.disabled = !slot.available;
      button.setAttribute('aria-pressed', state.time === slot.time ? 'true' : 'false');
      if (slot.reason === 'busy') {
        button.title = 'Bu saat dolu';
        button.setAttribute('aria-label', slot.time + ' — dolu');
      } else if (slot.reason === 'past') {
        button.title = 'Bu saat geçti';
        button.setAttribute('aria-label', slot.time + ' — geçti');
      }
      fragment.appendChild(button);
    });
    el.slots.appendChild(fragment);
  }

  function onDayClick(event) {
    var button = event.target.closest('.day');
    if (!button) return;

    state.date = button.dataset.date;
    state.time = null;
    clearNotice();

    Array.prototype.forEach.call(el.days.querySelectorAll('.day'), function (item) {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
    renderSlots();
  }

  function onSlotClick(event) {
    var button = event.target.closest('.slot');
    if (!button || button.disabled) return;

    state.time = button.dataset.time;
    clearNotice();

    Array.prototype.forEach.call(el.slots.querySelectorAll('.slot'), function (item) {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
  }

  /* --------------------------- Özet render ------------------------------ */

  function summaryRow(term, value, modifier) {
    var row = createEl('div', 'summary__row' + (modifier ? ' summary__row--' + modifier : ''));
    row.appendChild(createEl('dt', null, term));
    row.appendChild(createEl('dd', null, value));
    return row;
  }

  function renderSummaryInto(target, source) {
    target.innerHTML = '';
    if (!source) return;

    if (source.serviceLabel) target.appendChild(summaryRow('Hizmet', source.serviceLabel));
    if (source.regions && source.regions.length) {
      target.appendChild(summaryRow('Bölgeler', source.regions.join(', ')));
    }
    if (source.date) target.appendChild(summaryRow('Tarih', Booking.formatDateLong(source.date)));
    if (source.time) target.appendChild(summaryRow('Saat', source.time));
    target.appendChild(summaryRow('Toplam', Booking.formatPrice(source.total), 'total'));
  }

  function renderCurrentSummary() {
    var summary = Booking.getSummary(state);
    renderSummaryInto(el.summary, {
      serviceLabel: summary.serviceLabel,
      regions: summary.regions,
      date: state.date,
      time: state.time,
      total: summary.total
    });
  }

  /* --------------------------- Adım yönetimi ---------------------------- */

  function setStep(step) {
    currentStep = step;

    el.steps.forEach(function (section, index) {
      section.hidden = (index + 1) !== step;
    });

    Array.prototype.forEach.call(el.stepper.querySelectorAll('.stepper__item'), function (item) {
      var n = Number(item.dataset.step);
      item.classList.toggle('is-active', n === step);
      item.classList.toggle('is-done', n < step);
    });

    /* Aksiyon çubuğu: 3. adımda form butonu, 4. adımda hiç gerekmez */
    el.actionbar.hidden = (step === 3 || step === 4);
    el['btn-back'].hidden = (step === 1);
    el['total-bar'].hidden = false;

    if (step === 1) el['btn-next'].textContent = 'Tarih ve Saat Seç';
    if (step === 2) el['btn-next'].textContent = 'Bilgilerime Geç';

    scrollToTop();
  }

  function goToDateStep() {
    var check = Booking.validateServices(state);
    if (!check.ok) {
      showNotice(check.message);
      return;
    }
    clearNotice();
    refreshAppointments().then(function () {
      renderDays();
      renderSlots();
      setStep(2);
    });
  }

  function goToCustomerStep() {
    var check = Booking.validateSchedule(state);
    if (!check.ok) {
      showNotice(check.message);
      return;
    }

    return refreshAppointments().then(function () {
      if (Booking.hasConflict(appointments, state.date, state.time, Booking.getDuration(state))) {
        state.time = null;
        renderSlots();
        showNotice(Booking.CONFLICT_MESSAGE);
        return;
      }
      clearNotice();
      renderCurrentSummary();
      setStep(3);
    });
  }

  function onNextClick() {
    if (currentStep === 1) goToDateStep();
    else if (currentStep === 2) goToCustomerStep();
  }

  function onBackClick() {
    clearNotice();
    if (currentStep === 2) setStep(1);
    else if (currentStep === 3) setStep(2);
  }

  /* ------------------------ Adım 3: kayıt ------------------------------- */

  function onSubmit(event) {
    event.preventDefault();   /* sayfanın yenilenmesini engelle */

    state.customer.name = el['customer-name'].value;
    state.customer.phone = el['customer-phone'].value;

    el['customer-name'].setAttribute('aria-invalid', 'false');
    el['customer-phone'].setAttribute('aria-invalid', 'false');

    var serviceCheck = Booking.validateServices(state);
    if (!serviceCheck.ok) { showNotice(serviceCheck.message); setStep(1); return; }

    var scheduleCheck = Booking.validateSchedule(state);
    if (!scheduleCheck.ok) { showNotice(scheduleCheck.message); setStep(2); return; }

    var customerCheck = Booking.validateCustomer(state.customer);
    if (!customerCheck.ok) {
      showNotice(customerCheck.message);
      var field = el['customer-' + customerCheck.field];
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
      return;
    }

    var button = $('submit-appointment');
    button.disabled = true;

    refreshAppointments()
      .then(function () {
        if (Booking.hasConflict(appointments, state.date, state.time, Booking.getDuration(state))) {
          state.time = null;
          showNotice(Booking.CONFLICT_MESSAGE);
          renderSlots();
          setStep(2);
          return null;
        }
        return Store.create(Booking.buildAppointment(state));
      })
      .then(function (saved) {
        if (!saved) return;
        lastAppointment = saved;
        clearNotice();
        renderSummaryInto(el['confirm-summary'], {
          serviceLabel: saved.serviceLabel,
          regions: saved.regions,
          date: saved.date,
          time: saved.time,
          total: saved.total
        });
        setStep(4);
      })
      .catch(function (err) {
        console.error(err);
        showNotice(err && err.message ? err.message : 'Randevu kaydedilemedi. Lütfen tekrar deneyin.');
      })
      .then(function () {
        button.disabled = false;
      });
  }

  function startOver() {
    state = Booking.createState();
    lastAppointment = null;
    el['customer-form'].reset();
    syncServiceButtons();
    updateTotal();
    clearNotice();
    setStep(1);
  }

  /* ------------------------------ Veri ---------------------------------- */

  function refreshAppointments() {
    return Store.list()
      .then(function (rows) { appointments = rows; return rows; })
      .catch(function (err) {
        console.error(err);
        appointments = [];
        return [];
      });
  }

  /* ------------------------------ Başlat -------------------------------- */

  function init() {
    cacheElements();
    renderCategories();
    renderDays();
    updateTotal();
    setStep(1);

    el.categories.addEventListener('click', onServiceClick);
    el.days.addEventListener('click', onDayClick);
    el.slots.addEventListener('click', onSlotClick);
    el['btn-next'].addEventListener('click', onNextClick);
    el['btn-back'].addEventListener('click', onBackClick);
    el['customer-form'].addEventListener('submit', onSubmit);
    el['new-appointment'].addEventListener('click', startOver);

    /* Başka sekmede (ör. yönetici panelinde) yapılan değişiklikleri yakala */
    window.addEventListener('storage', function (event) {
      if (event.key && event.key !== Store.STORAGE_KEY) return;
      refreshAppointments().then(function () {
        if (currentStep === 2) renderSlots();
      });
    });

    refreshAppointments();

    /* Test ve hata ayıklama için okunur durum */
    window.MelekApp = {
      getState: function () { return state; },
      getStep: function () { return currentStep; },
      getLastAppointment: function () { return lastAppointment; },
      reset: startOver
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
