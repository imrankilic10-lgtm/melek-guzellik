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
  var maxStepReached = 1;     /* adım göstergesinden geri dönebilmek için */
  var slots = [];             /* seçili günün saat durumu (sunucudan veya yerelden) */
  var lastAppointment = null;
  var submitting = false;

  var el = {};

  /* ----------------------------- yardımcılar ---------------------------- */

  function $(id) { return document.getElementById(id); }

  function createEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
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

  /* ------------------------ Adım 1: hizmetler --------------------------- */

  function renderCategories() {
    var fragment = document.createDocumentFragment();

    Data.CATEGORIES.forEach(function (category) {
      var section = createEl('section', 'category');
      section.dataset.categoryId = category.id;

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
        var mark = createEl('span', 'option__mark');
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
    Array.prototype.forEach.call(el.categories.querySelectorAll('.option'), function (button) {
      button.setAttribute('aria-pressed',
        Booking.isSelected(state, button.dataset.serviceId) ? 'true' : 'false');
    });
  }

  /* Seçilen hizmetleri kaldırılabilir etiketler halinde gösterir */
  function renderChips() {
    var selected = Booking.getSelectedServices(state);
    el.chips.hidden = selected.length === 0;
    el.chipsList.innerHTML = '';

    var fragment = document.createDocumentFragment();
    selected.forEach(function (item) {
      var li = createEl('li');
      var button = createEl('button', 'chip');
      button.type = 'button';
      button.dataset.serviceId = item.id;
      button.setAttribute('aria-label', item.name + ' seçimini kaldır');
      button.appendChild(createEl('span', 'chip__name', item.name));
      button.appendChild(createEl('span', 'chip__price', Booking.formatPrice(item.price)));
      button.appendChild(createEl('span', 'chip__remove', '×'));
      li.appendChild(button);
      fragment.appendChild(li);
    });
    el.chipsList.appendChild(fragment);
  }

  function onServiceClick(event) {
    var button = event.target.closest('.option');
    if (!button) return;
    toggleService(button.dataset.serviceId);
  }

  function onChipClick(event) {
    var button = event.target.closest('.chip');
    if (!button) return;
    toggleService(button.dataset.serviceId);
  }

  function toggleService(serviceId) {
    Booking.toggleService(state, serviceId);
    syncServiceButtons();
    renderChips();
    updateTotal();
    clearNotice();

    /* Süre değişince seçili saat geçersiz kalmış olabilir;
       doğrulama adım 2'ye girerken sunucudan tazelenir. */
    if (state.date && state.time) state.time = null;
  }

  function clearAllServices() {
    state.serviceIds = [];
    state.time = null;
    syncServiceButtons();
    renderChips();
    updateTotal();
    clearNotice();
  }

  function updateTotal() {
    var duration = Booking.getDuration(state);
    el.totalPrice.textContent = Booking.formatPrice(Booking.getTotal(state));
    el.totalMeta.textContent = duration ? 'yakl. ' + Booking.formatDuration(duration) : '';
  }

  /* ------------------------ Adım 2: tarih & saat ------------------------ */

  function renderDays() {
    var days = Booking.buildDays(new Date(), Data.BOOKABLE_DAYS);
    var fragment = document.createDocumentFragment();

    days.forEach(function (day) {
      var button = createEl('button', 'day');
      button.type = 'button';
      button.dataset.date = day.iso;
      button.disabled = day.closed;
      button.setAttribute('aria-pressed', state.date === day.iso ? 'true' : 'false');
      button.setAttribute('aria-label',
        Booking.formatDateLong(day.iso) + (day.closed ? ' — kapalı' : ''));

      button.appendChild(createEl('span', 'day__weekday', day.isToday ? 'Bugün' : day.weekday));
      button.appendChild(createEl('span', 'day__num', String(day.dayNumber)));
      button.appendChild(createEl('span', 'day__month', day.closed ? 'Kapalı' : day.month));
      fragment.appendChild(button);
    });

    el.days.innerHTML = '';
    el.days.appendChild(fragment);
  }

  /* Seçili gün için saatleri getirir ve çizer (API veya yerel mod) */
  function renderSlots() {
    el.slots.innerHTML = '';

    if (!state.date) {
      el.timeHint.hidden = false;
      el.timeHint.textContent = 'Saatleri görmek için önce bir tarih seçin.';
      el.legend.hidden = true;
      return Promise.resolve();
    }

    el.timeHint.hidden = false;
    el.timeHint.textContent = 'Saatler yükleniyor…';

    var duration = Booking.getDuration(state);
    var requestedDate = state.date;

    return Store.getSlots(requestedDate, duration)
      .catch(function (err) {
        console.error(err);
        return null;
      })
      .then(function (result) {
        /* Kullanıcı bu arada başka gün seçtiyse eski yanıtı yoksay */
        if (requestedDate !== state.date) return;

        if (!result) {
          el.timeHint.hidden = false;
          el.timeHint.textContent = 'Saatler yüklenemedi. Lütfen tekrar deneyin.';
          el.legend.hidden = true;
          return;
        }
        slots = result;
        drawSlots(result);
      });
  }

  function drawSlots(slotList) {
    el.slots.innerHTML = '';
    var openCount = slotList.filter(function (slot) { return slot.available; }).length;

    el.timeHint.hidden = openCount > 0;
    if (!openCount) {
      el.timeHint.textContent = Booking.isDayClosed(state.date)
        ? 'Salonumuz bu tarihte kapalıdır. Lütfen başka bir gün seçin.'
        : 'Bu gün için uygun saat kalmadı. Lütfen başka bir gün seçin.';
    }
    el.legend.hidden = openCount === slotList.length || openCount === 0;

    var fragment = document.createDocumentFragment();
    slotList.forEach(function (slot) {
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
      } else if (slot.reason === 'closed') {
        button.title = 'Salon kapalı';
        button.setAttribute('aria-label', slot.time + ' — kapalı');
      }
      fragment.appendChild(button);
    });
    el.slots.appendChild(fragment);
  }

  function onDayClick(event) {
    var button = event.target.closest('.day');
    if (!button || button.disabled) return;

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
    if (source.time) {
      target.appendChild(summaryRow('Saat',
        source.time + ' – ' + Booking.endTime(source.time, source.duration || 30)));
    }
    if (source.duration) {
      target.appendChild(summaryRow('Tahmini süre', Booking.formatDuration(source.duration)));
    }
    target.appendChild(summaryRow('Toplam', Booking.formatPrice(source.total), 'total'));
  }

  function renderCurrentSummary() {
    var summary = Booking.getSummary(state);
    renderSummaryInto(el.summary, {
      serviceLabel: summary.serviceLabel,
      regions: summary.regions,
      date: state.date,
      time: state.time,
      duration: summary.duration,
      total: summary.total
    });
  }

  /* --------------------------- Adım yönetimi ---------------------------- */

  function setStep(step, options) {
    var silent = options && options.silent;
    currentStep = step;
    if (step > maxStepReached) maxStepReached = step;

    el.steps.forEach(function (section, index) {
      section.hidden = (index + 1) !== step;
    });

    Array.prototype.forEach.call(el.stepper.querySelectorAll('.stepper__item'), function (item) {
      var n = Number(item.dataset.step);
      item.classList.toggle('is-active', n === step);
      item.classList.toggle('is-done', n < step);
      /* Onay adımına geçildiyse geri dönüş kapanır */
      var button = item.querySelector('.stepper__btn');
      button.disabled = !(n < step && step < 4);
    });

    el.actionbar.hidden = (step === 3 || step === 4);
    el.btnBack.hidden = (step === 1);

    if (step === 1) el.btnNext.textContent = 'Tarih ve Saat Seç';
    if (step === 2) el.btnNext.textContent = 'Bilgilerime Geç';

    if (!silent) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      /* Ekran okuyucu ve klavye odağını yeni adıma taşı */
      el.steps[step - 1].focus({ preventScroll: true });
    }
  }

  function goToDateStep() {
    var check = Booking.validateServices(state);
    if (!check.ok) { showNotice(check.message); return; }

    clearNotice();
    renderDays();
    setStep(2);
    return renderSlots();
  }

  function goToCustomerStep() {
    var check = Booking.validateSchedule(state);
    if (!check.ok) { showNotice(check.message); return; }

    var chosen = state.time;
    var label = el.btnNext.textContent;
    el.btnNext.disabled = true;
    el.btnNext.textContent = 'Kontrol ediliyor…';

    /* Saat hâlâ boş mu? (başkası bu arada almış olabilir) */
    return Store.getSlots(state.date, Booking.getDuration(state))
      .then(function (result) {
        slots = result;
        var match = result.filter(function (slot) { return slot.time === chosen; })[0];

        if (!match || !match.available) {
          state.time = null;
          drawSlots(result);
          showNotice(Booking.CONFLICT_MESSAGE);
          return;
        }
        clearNotice();
        renderCurrentSummary();
        setStep(3);
      })
      .catch(function (err) {
        console.error(err);
        showNotice('Saatler kontrol edilemedi. Lütfen tekrar deneyin.');
      })
      .then(function () {
        el.btnNext.disabled = false;
        if (currentStep === 2) el.btnNext.textContent = label;
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

  function onStepperClick(event) {
    var button = event.target.closest('.stepper__btn');
    if (!button || button.disabled) return;

    var target = Number(button.dataset.goto);
    if (target >= currentStep || currentStep === 4) return;

    clearNotice();
    if (target === 2) { renderDays(); setStep(target); renderSlots(); return; }
    setStep(target);
  }

  /* ------------------------ Adım 3: kayıt ------------------------------- */

  function onSubmit(event) {
    event.preventDefault();          /* sayfanın yenilenmesini engelle */
    if (submitting) return;

    state.customer.name = el.customerName.value;
    state.customer.phone = el.customerPhone.value;
    state.customer.note = el.customerNote.value;

    el.customerName.setAttribute('aria-invalid', 'false');
    el.customerPhone.setAttribute('aria-invalid', 'false');

    var serviceCheck = Booking.validateServices(state);
    if (!serviceCheck.ok) { showNotice(serviceCheck.message); setStep(1); return; }

    var scheduleCheck = Booking.validateSchedule(state);
    if (!scheduleCheck.ok) { showNotice(scheduleCheck.message); setStep(2); return; }

    var customerCheck = Booking.validateCustomer(state.customer);
    if (!customerCheck.ok) {
      showNotice(customerCheck.message);
      var field = customerCheck.field === 'name' ? el.customerName : el.customerPhone;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return;
    }

    submitting = true;
    el.submitButton.disabled = true;
    el.submitButton.textContent = 'Kaydediliyor…';

    Store.createAppointment({
      serviceIds: state.serviceIds.slice(),
      date: state.date,
      time: state.time,
      customerName: String(state.customer.name || '').trim(),
      phone: Booking.normalizePhone(state.customer.phone),
      note: String(state.customer.note || '').trim()
    })
      .then(function (saved) {
        if (!saved) return;
        lastAppointment = saved;
        clearNotice();
        renderSummaryInto(el.confirmSummary, {
          serviceLabel: saved.serviceLabel,
          regions: saved.regions,
          date: saved.date,
          time: saved.time,
          duration: saved.duration,
          total: saved.total
        });
        setStep(4);
      })
      .catch(function (err) {
        console.error(err);
        showNotice(err && err.message ? err.message : 'Randevu kaydedilemedi. Lütfen tekrar deneyin.');
        /* Saat kapıldıysa kullanıcıyı saat seçimine geri al */
        if (err && err.status === 409) {
          state.time = null;
          setStep(2);
          renderSlots();
        }
      })
      .then(function () {
        submitting = false;
        el.submitButton.disabled = false;
        el.submitButton.textContent = 'Randevuyu Oluştur';
      });
  }

  /* Randevuyu telefonun takvimine ekler (.ics indirir) */
  function onAddToCalendar() {
    if (!lastAppointment) return;
    try {
      var blob = new Blob([Booking.buildICS(lastAppointment)],
        { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'melek-randevu-' + lastAppointment.date + '.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      console.error(err);
      showNotice('Takvim dosyası oluşturulamadı.');
    }
  }

  function startOver() {
    state = Booking.createState();
    lastAppointment = null;
    maxStepReached = 1;
    el.customerForm.reset();
    el.customerName.setAttribute('aria-invalid', 'false');
    el.customerPhone.setAttribute('aria-invalid', 'false');
    syncServiceButtons();
    renderChips();
    updateTotal();
    clearNotice();
    setStep(1);
  }

  /* ------------------------------ Başlat -------------------------------- */

  function cacheElements() {
    el.stepper = $('stepper');
    el.notice = $('notice');
    el.categories = $('categories');
    el.chips = $('chips');
    el.chipsList = $('chips-list');
    el.days = $('days');
    el.slots = $('slots');
    el.timeHint = $('time-hint');
    el.legend = $('slots-legend');
    el.summary = $('summary');
    el.confirmSummary = $('confirm-summary');
    el.customerForm = $('customer-form');
    el.customerName = $('customer-name');
    el.customerPhone = $('customer-phone');
    el.customerNote = $('customer-note');
    el.submitButton = $('submit-appointment');
    el.btnNext = $('btn-next');
    el.btnBack = $('btn-back');
    el.totalPrice = $('total-price');
    el.totalMeta = $('total-meta');
    el.actionbar = $('actionbar');
    el.steps = [1, 2, 3, 4].map(function (n) { return $('step-' + n); });
  }


  /* Telefon bağlantılarını config.js'teki numaraya göre günceller */
  function applySalonInfo() {
    var salon = (window.MelekConfig || {}).salon;
    if (!salon) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-phone]'), function (link) {
      link.href = salon.phoneLink;
      link.setAttribute('aria-label', 'Telefonla ara: ' + salon.phoneDisplay);
      var text = link.querySelector('[data-phone-text]');
      if (text) text.textContent = salon.phoneDisplay;
    });
  }

  function renderFooterHours() {
    var slots = Data.TIME_SLOTS;
    var closing = Booking.endTime(slots[slots.length - 1], 30);
    $('footer-hours').textContent = 'Her gün ' + slots[0] + ' – ' + closing;
  }

  function init() {
    cacheElements();
    renderCategories();
    renderChips();
    renderDays();
    updateTotal();
    renderFooterHours();
    applySalonInfo();
    setStep(1, { silent: true });

    el.categories.addEventListener('click', onServiceClick);
    el.chipsList.addEventListener('click', onChipClick);
    $('clear-all').addEventListener('click', clearAllServices);
    el.days.addEventListener('click', onDayClick);
    el.slots.addEventListener('click', onSlotClick);
    el.stepper.addEventListener('click', onStepperClick);
    el.btnNext.addEventListener('click', onNextClick);
    el.btnBack.addEventListener('click', onBackClick);
    el.customerForm.addEventListener('submit', onSubmit);
    $('add-to-calendar').addEventListener('click', onAddToCalendar);
    $('new-appointment').addEventListener('click', startOver);

    /* Yerel modda başka sekmedeki (ör. yönetici paneli) değişiklikleri yakala */
    window.addEventListener('storage', function (event) {
      if (event.key && event.key !== Store.STORAGE_KEY) return;
      if (currentStep === 2) renderSlots();
    });

    Store.init();

    /* Test ve hata ayıklama için okunur durum */
    window.MelekApp = {
      getState: function () { return state; },
      getStep: function () { return currentStep; },
      getLastAppointment: function () { return lastAppointment; },
      getSlots: function () { return slots.slice(); },
      reset: startOver
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
