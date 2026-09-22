/*
 * admin.js — Yönetici paneli.
 * Randevuları listeler, arar, filtreler; elle randevu ekler, durum günceller,
 * siler ve yedekler. Veri erişimi store.js üzerindendir.
 */
(function () {
  'use strict';

  var Data = window.MelekData;
  var Booking = window.MelekBooking;
  var Store = window.MelekStore;
  var Config = window.MelekConfig;

  var SESSION_KEY = 'melekAdminSession';

  var FILTER_TITLES = {
    today: 'Bugünkü Randevular',
    tomorrow: 'Yarınki Randevular',
    week: 'Bu Haftaki Randevular',
    upcoming: 'Yaklaşan Randevular',
    past: 'Geçmiş Randevular',
    all: 'Tüm Randevular'
  };

  var EMPTY_TEXTS = {
    today: 'Bugün için randevu yok.',
    tomorrow: 'Yarın için randevu yok.',
    week: 'Bu hafta için randevu yok.',
    upcoming: 'Yaklaşan randevu yok.',
    past: 'Geçmiş randevu kaydı yok.',
    all: 'Henüz randevu kaydı yok.'
  };

  var STATUS_LABELS = { done: 'Geldi', 'no-show': 'Gelmedi' };

  var activeFilter = 'today';
  var searchTerm = '';
  var appointments = [];
  var createState = Booking.createState();
  var el = {};

  /* ----------------------------- yardımcılar ---------------------------- */

  function $(id) { return document.getElementById(id); }

  function createEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function todayISO() { return Booking.toISODate(new Date()); }
  function tomorrowISO() { return Booking.toISODate(Booking.addDays(new Date(), 1)); }

  function showNotice(message, isError) {
    el.notice.textContent = message;
    el.notice.className = 'notice' + (isError ? '' : ' is-ok');
    el.notice.hidden = false;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(function () { el.notice.hidden = true; }, 5000);
  }

  /* ------------------------------- giriş -------------------------------- */

  function isSignedIn() {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === 'ok';
    } catch (err) {
      return false;
    }
  }

  function setSignedIn(value) {
    try {
      if (value) window.sessionStorage.setItem(SESSION_KEY, 'ok');
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch (err) {
      /* sessionStorage kapalıysa oturum sayfa yenilenene kadar sürer */
    }
  }

  function showPanel() {
    el.gate.hidden = true;
    el.panel.hidden = false;
    document.body.classList.remove('is-locked');
    el.todayLabel.textContent = Booking.formatDateLong(todayISO());
    renderCreateServices();
    load();
  }

  function showGate() {
    el.panel.hidden = true;
    el.gate.hidden = false;
    document.body.classList.add('is-locked');
    el.gateError.hidden = true;
    el.gatePasscode.value = '';
    el.gatePasscode.focus();
  }

  function onGateSubmit(event) {
    event.preventDefault();
    var value = el.gatePasscode.value;

    if (value === Config.adminPasscode) {
      setSignedIn(true);
      showPanel();
      return;
    }
    el.gateError.textContent = 'Şifre hatalı. Lütfen tekrar deneyin.';
    el.gateError.hidden = false;
    el.gatePasscode.value = '';
    el.gatePasscode.focus();
  }

  function onLogout() {
    setSignedIn(false);
    showGate();
  }

  /* ------------------------------ filtreler ----------------------------- */

  function weekEndISO() {
    return Booking.toISODate(Booking.addDays(new Date(), 6));
  }

  function filterByRange(rows, filter) {
    var today = todayISO();
    if (filter === 'today') return rows.filter(function (r) { return r.date === today; });
    if (filter === 'tomorrow') {
      var tomorrow = tomorrowISO();
      return rows.filter(function (r) { return r.date === tomorrow; });
    }
    if (filter === 'week') {
      var end = weekEndISO();
      return rows.filter(function (r) { return r.date >= today && r.date <= end; });
    }
    if (filter === 'upcoming') return rows.filter(function (r) { return r.date >= today; });
    if (filter === 'past') {
      return rows.filter(function (r) { return r.date < today; })
                 .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    }
    return rows;
  }

  function matchesSearch(row, term) {
    if (!term) return true;
    var haystack = [
      row.customerName, row.phone, row.serviceLabel,
      (row.regions || []).join(' '), row.note, row.date
    ].join(' ').toLocaleLowerCase('tr');
    return haystack.indexOf(term) !== -1;
  }

  function visibleRows() {
    return filterByRange(appointments, activeFilter).filter(function (row) {
      return matchesSearch(row, searchTerm);
    });
  }

  /* ------------------------------- render ------------------------------- */

  function renderStats() {
    var today = todayISO();
    var todayRows = appointments.filter(function (r) { return r.date === today; });
    var upcoming = appointments.filter(function (r) { return r.date >= today; });
    var revenue = todayRows.reduce(function (sum, r) { return sum + (r.total || 0); }, 0);

    el.statToday.textContent = String(todayRows.length);
    el.statUpcoming.textContent = String(upcoming.length);
    el.statAll.textContent = String(appointments.length);
    el.statRevenue.textContent = Booking.formatPrice(revenue);
  }

  function statusButton(row, status, label) {
    var button = createEl('button', 'btn btn--ghost btn--small', label);
    button.type = 'button';
    button.dataset.action = 'status';
    button.dataset.id = row.id;
    button.dataset.status = status;
    if (row.status === status) button.classList.add('is-active');
    button.setAttribute('aria-pressed', row.status === status ? 'true' : 'false');
    return button;
  }

  function renderAppointment(row) {
    var isToday = row.date === todayISO();
    var card = createEl('article', 'appointment' + (isToday ? ' appointment--today' : ''));
    if (row.status) card.classList.add('appointment--' + row.status);
    card.dataset.id = row.id;

    var head = createEl('div', 'appointment__head');
    var when = createEl('span', 'appointment__when');
    when.appendChild(createEl('span', null, Booking.formatDateLong(row.date)));
    when.appendChild(createEl('span', 'appointment__time',
      row.time + '–' + Booking.endTime(row.time, row.duration || 30)));
    head.appendChild(when);
    head.appendChild(createEl('span', 'appointment__total', Booking.formatPrice(row.total || 0)));
    card.appendChild(head);

    var nameLine = createEl('p', 'appointment__name');
    nameLine.appendChild(createEl('span', null, row.customerName || '—'));
    if (row.status) {
      nameLine.appendChild(createEl('span', 'badge badge--' + row.status, STATUS_LABELS[row.status]));
    }
    if (row.source === 'admin') {
      nameLine.appendChild(createEl('span', 'badge badge--manual', 'Telefonla'));
    }
    card.appendChild(nameLine);

    var phoneLine = createEl('p', 'appointment__line');
    if (row.phone) {
      var link = createEl('a', null, row.phone);
      link.href = 'tel:' + row.phone;
      phoneLine.appendChild(link);
    } else {
      phoneLine.textContent = '—';
    }
    card.appendChild(phoneLine);

    card.appendChild(createEl('p', 'appointment__line', 'Hizmet: ' + (row.serviceLabel || '—')));
    if (row.regions && row.regions.length) {
      card.appendChild(createEl('p', 'appointment__line', 'Bölgeler: ' + row.regions.join(', ')));
    }
    if (row.duration) {
      card.appendChild(createEl('p', 'appointment__line',
        'Süre: yakl. ' + Booking.formatDuration(row.duration)));
    }
    if (row.note) {
      card.appendChild(createEl('p', 'appointment__note', 'Not: ' + row.note));
    }

    var actions = createEl('div', 'appointment__actions no-print');
    actions.appendChild(statusButton(row, 'done', 'Geldi'));
    actions.appendChild(statusButton(row, 'no-show', 'Gelmedi'));

    var deleteButton = createEl('button', 'btn btn--danger btn--small', 'Sil');
    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.id = row.id;
    deleteButton.setAttribute('aria-label',
      (row.customerName || 'Randevu') + ' — ' + row.date + ' ' + row.time + ' randevusunu sil');
    actions.appendChild(deleteButton);
    card.appendChild(actions);

    return card;
  }

  function renderList() {
    var rows = visibleRows();
    el.title.textContent = FILTER_TITLES[activeFilter] +
      (rows.length ? ' (' + rows.length + ')' : '');
    el.list.innerHTML = '';

    if (!rows.length) {
      el.list.appendChild(createEl('p', 'empty',
        searchTerm ? 'Aramanıza uygun randevu bulunamadı.' : EMPTY_TEXTS[activeFilter]));
      return;
    }

    var fragment = document.createDocumentFragment();
    rows.forEach(function (row) { fragment.appendChild(renderAppointment(row)); });
    el.list.appendChild(fragment);
  }

  function render() {
    renderStats();
    renderList();
  }

  function load() {
    return Store.list()
      .then(function (rows) { appointments = rows; render(); refreshCreateTimes(); })
      .catch(function (err) {
        console.error(err);
        appointments = [];
        render();
      });
  }

  /* --------------------------- elle randevu ----------------------------- */

  function renderCreateServices() {
    var container = el.createServices;
    var fragment = document.createDocumentFragment();

    Data.CATEGORIES.forEach(function (category) {
      var group = createEl('div', 'mini-group');
      group.appendChild(createEl('p', 'mini-group__title', category.name));

      var list = createEl('div', 'mini-options');
      category.services.forEach(function (service) {
        var button = createEl('button', 'mini-option');
        button.type = 'button';
        button.dataset.serviceId = service.id;
        button.setAttribute('aria-pressed', 'false');
        button.appendChild(createEl('span', 'mini-option__name', service.name));
        button.appendChild(createEl('span', 'mini-option__price', service.price + ' TL'));
        list.appendChild(button);
      });
      group.appendChild(list);
      fragment.appendChild(group);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
  }

  function syncCreateServices() {
    Array.prototype.forEach.call(el.createServices.querySelectorAll('.mini-option'), function (button) {
      button.setAttribute('aria-pressed',
        Booking.isSelected(createState, button.dataset.serviceId) ? 'true' : 'false');
    });
    var duration = Booking.getDuration(createState);
    el.createTotal.textContent = Booking.formatPrice(Booking.getTotal(createState));
    el.createDuration.textContent = duration ? '· yakl. ' + Booking.formatDuration(duration) : '';
  }

  function onCreateServiceClick(event) {
    var button = event.target.closest('.mini-option');
    if (!button) return;
    Booking.toggleService(createState, button.dataset.serviceId);
    syncCreateServices();
    refreshCreateTimes();
  }

  /* Seçili tarihe göre uygun saatleri doldurur */
  function refreshCreateTimes() {
    if (!el.createDate) return;
    var date = el.createDate.value;
    var select = el.createTime;
    var previous = select.value;

    select.innerHTML = '';

    if (!date) {
      select.appendChild(new Option('Önce tarih seçin', ''));
      return;
    }
    if (Booking.isDayClosed(date)) {
      select.appendChild(new Option('Salon bu tarihte kapalı', ''));
      return;
    }

    var duration = Booking.getDuration(createState) || 30;
    var slots = Booking.buildSlots(date, appointments, duration, new Date());
    select.appendChild(new Option('Saat seçin', ''));

    slots.forEach(function (slot) {
      var label = slot.time + (slot.available ? '' :
        (slot.reason === 'busy' ? ' — dolu' : ' — geçti'));
      var option = new Option(label, slot.time);
      option.disabled = !slot.available;
      select.appendChild(option);
    });

    if (previous) select.value = previous;
  }

  function toggleCreateForm(open) {
    var willOpen = open === undefined ? el.createForm.hidden : open;
    el.createForm.hidden = !willOpen;
    el.toggleCreate.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    el.toggleCreate.textContent = willOpen ? 'Formu Kapat' : 'Yeni Randevu Ekle';
    if (willOpen) {
      el.createDate.min = todayISO();
      if (!el.createDate.value) el.createDate.value = todayISO();
      refreshCreateTimes();
      el.createDate.focus();
    }
  }

  function resetCreateForm() {
    createState = Booking.createState();
    el.createForm.reset();
    el.createError.hidden = true;
    syncCreateServices();
    el.createDate.value = todayISO();
    refreshCreateTimes();
  }

  function showCreateError(message) {
    el.createError.textContent = message;
    el.createError.className = 'notice';
    el.createError.hidden = false;
  }

  function onCreateSubmit(event) {
    event.preventDefault();

    var serviceCheck = Booking.validateServices(createState);
    if (!serviceCheck.ok) { showCreateError(serviceCheck.message); return; }

    createState.date = el.createDate.value;
    createState.time = el.createTime.value;

    var scheduleCheck = Booking.validateSchedule(createState);
    if (!scheduleCheck.ok) { showCreateError(scheduleCheck.message); return; }

    createState.customer.name = el.createName.value;
    createState.customer.phone = el.createPhone.value;
    createState.customer.note = el.createNote.value;

    var customerCheck = Booking.validateCustomer(createState.customer);
    if (!customerCheck.ok) { showCreateError(customerCheck.message); return; }

    el.createSubmit.disabled = true;

    Store.list()
      .then(function (rows) {
        appointments = rows;
        if (Booking.hasConflict(rows, createState.date, createState.time,
                                Booking.getDuration(createState))) {
          showCreateError(Booking.CONFLICT_MESSAGE);
          refreshCreateTimes();
          return null;
        }
        var record = Booking.buildAppointment(createState);
        record.source = 'admin';
        return Store.create(record);
      })
      .then(function (saved) {
        if (!saved) return;
        resetCreateForm();
        toggleCreateForm(false);
        return load().then(function () {
          showNotice(saved.customerName + ' için randevu eklendi: ' +
            Booking.formatDateShort(saved.date) + ' ' + saved.time);
        });
      })
      .catch(function (err) {
        console.error(err);
        showCreateError(err && err.message ? err.message : 'Randevu kaydedilemedi.');
      })
      .then(function () { el.createSubmit.disabled = false; });
  }

  /* ------------------------------ eylemler ------------------------------ */

  function onFilterClick(event) {
    var button = event.target.closest('.filter');
    if (!button) return;

    activeFilter = button.dataset.filter;
    Array.prototype.forEach.call(el.filters.querySelectorAll('.filter'), function (item) {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
    renderList();
  }

  function onSearch() {
    searchTerm = el.search.value.trim().toLocaleLowerCase('tr');
    renderList();
  }

  function onListClick(event) {
    var button = event.target.closest('[data-action]');
    if (!button) return;

    var id = button.dataset.id;
    var row = appointments.filter(function (item) { return item.id === id; })[0];
    if (!row) return;

    if (button.dataset.action === 'status') {
      /* Aynı düğmeye tekrar basmak işareti kaldırır */
      var next = row.status === button.dataset.status ? null : button.dataset.status;
      Store.update(id, { status: next })
        .then(function () { return load(); })
        .catch(function (err) { console.error(err); showNotice('Güncellenemedi.', true); });
      return;
    }

    if (button.dataset.action === 'delete') {
      var confirmed = window.confirm(
        (row.customerName || 'Bu randevu') + ' — ' +
        Booking.formatDateLong(row.date) + ' ' + row.time +
        '\n\nRandevuyu silmek istediğinize emin misiniz?'
      );
      if (!confirmed) return;

      Store.remove(id)
        .then(function () { return load(); })
        .then(function () { showNotice('Randevu silindi.'); })
        .catch(function (err) { console.error(err); showNotice('Randevu silinemedi.', true); });
    }
  }

  /* ------------------------------ yedekleme ----------------------------- */

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function stamp() { return todayISO(); }

  function onExportJson() {
    if (!appointments.length) { showNotice('Dışa aktarılacak randevu yok.', true); return; }
    downloadFile('melek-randevular-' + stamp() + '.json',
      JSON.stringify(appointments, null, 2), 'application/json');
    showNotice(appointments.length + ' randevu yedeklendi.');
  }

  function csvCell(value) {
    var text = String(value === undefined || value === null ? '' : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function onExportCsv() {
    if (!appointments.length) { showNotice('Dışa aktarılacak randevu yok.', true); return; }

    var header = ['Tarih', 'Saat', 'Ad Soyad', 'Telefon', 'Hizmet', 'Bölgeler',
                  'Süre (dk)', 'Toplam (TL)', 'Durum', 'Not'];
    var lines = [header.map(csvCell).join(';')];

    appointments.forEach(function (row) {
      lines.push([
        row.date, row.time, row.customerName, row.phone, row.serviceLabel,
        (row.regions || []).join(', '), row.duration || '', row.total || 0,
        STATUS_LABELS[row.status] || '', row.note || ''
      ].map(csvCell).join(';'));
    });

    /* BOM: Excel'in Türkçe karakterleri doğru okuması için */
    downloadFile('melek-randevular-' + stamp() + '.csv',
      '﻿' + lines.join('\r\n'), 'text/csv');
    showNotice(appointments.length + ' randevu CSV olarak indirildi.');
  }

  function onImportFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var rows;
      try {
        rows = JSON.parse(String(reader.result));
      } catch (err) {
        showNotice('Yedek dosyası okunamadı. Geçerli bir JSON dosyası seçin.', true);
        return;
      }
      if (!Array.isArray(rows)) {
        showNotice('Yedek dosyası beklenen biçimde değil.', true);
        return;
      }
      var confirmed = window.confirm(
        'Mevcut ' + appointments.length + ' randevunun yerine yedekteki ' +
        rows.length + ' randevu yüklenecek.\n\nDevam edilsin mi?'
      );
      if (!confirmed) return;

      Store.replaceAll(rows)
        .then(function (count) { return load().then(function () { return count; }); })
        .then(function (count) { showNotice(count + ' randevu geri yüklendi.'); })
        .catch(function (err) {
          console.error(err);
          showNotice('Geri yükleme başarısız oldu.', true);
        });
    };
    reader.onerror = function () { showNotice('Dosya okunamadı.', true); };
    reader.readAsText(file);
    event.target.value = '';
  }

  /* -------------------------------- başlat ------------------------------ */


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

  function cacheElements() {
    el.gate = $('gate');
    el.gateForm = $('gate-form');
    el.gatePasscode = $('gate-passcode');
    el.gateError = $('gate-error');
    el.panel = $('panel');
    el.todayLabel = $('today-label');
    el.filters = $('filters');
    el.search = $('search');
    el.list = $('appointment-list');
    el.title = $('list-title');
    el.notice = $('admin-notice');
    el.statToday = $('stat-today');
    el.statUpcoming = $('stat-upcoming');
    el.statAll = $('stat-all');
    el.statRevenue = $('stat-revenue');
    el.toggleCreate = $('toggle-create');
    el.createForm = $('create-form');
    el.createServices = $('create-services');
    el.createTotal = $('create-total');
    el.createDuration = $('create-duration');
    el.createDate = $('create-date');
    el.createTime = $('create-time');
    el.createName = $('create-name');
    el.createPhone = $('create-phone');
    el.createNote = $('create-note');
    el.createError = $('create-error');
    el.createSubmit = $('create-submit');
  }

  function init() {
    cacheElements();
    applySalonInfo();

    el.gateForm.addEventListener('submit', onGateSubmit);
    $('logout').addEventListener('click', onLogout);
    el.filters.addEventListener('click', onFilterClick);
    el.search.addEventListener('input', onSearch);
    el.list.addEventListener('click', onListClick);
    el.toggleCreate.addEventListener('click', function () { toggleCreateForm(); });
    $('create-cancel').addEventListener('click', function () {
      resetCreateForm();
      toggleCreateForm(false);
    });
    el.createServices.addEventListener('click', onCreateServiceClick);
    el.createDate.addEventListener('change', refreshCreateTimes);
    el.createForm.addEventListener('submit', onCreateSubmit);
    $('print').addEventListener('click', function () { window.print(); });
    $('export-json').addEventListener('click', onExportJson);
    $('export-csv').addEventListener('click', onExportCsv);
    $('import-file').addEventListener('change', onImportFile);

    /* Müşteri sayfası başka sekmede randevu oluşturursa liste tazelensin */
    window.addEventListener('storage', function (event) {
      if (event.key && event.key !== Store.STORAGE_KEY) return;
      if (!el.panel.hidden) load();
    });

    if (isSignedIn()) showPanel();
    else showGate();

    window.MelekAdmin = {
      reload: load,
      getFilter: function () { return activeFilter; },
      getAppointments: function () { return appointments.slice(); },
      getVisible: visibleRows
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
