/*
 * admin.js — Yönetici paneli.
 * Randevuları listeler, filtreler ve siler. Veri erişimi store.js üzerindendir.
 */
(function () {
  'use strict';

  var Booking = window.MelekBooking;
  var Store = window.MelekStore;

  var FILTER_TITLES = {
    today: 'Bugünkü Randevular',
    tomorrow: 'Yarınki Randevular',
    upcoming: 'Yaklaşan Randevular',
    all: 'Tüm Randevular'
  };

  var EMPTY_TEXTS = {
    today: 'Bugün için randevu yok.',
    tomorrow: 'Yarın için randevu yok.',
    upcoming: 'Yaklaşan randevu yok.',
    all: 'Henüz randevu kaydı yok.'
  };

  var activeFilter = 'today';
  var appointments = [];
  var el = {};

  function $(id) { return document.getElementById(id); }

  function createEl(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function todayISO() { return Booking.toISODate(new Date()); }
  function tomorrowISO() { return Booking.toISODate(Booking.addDays(new Date(), 1)); }

  function showNotice(message) {
    el.notice.textContent = message;
    el.notice.className = 'notice is-ok';
    el.notice.hidden = false;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(function () { el.notice.hidden = true; }, 4000);
  }

  function filterRows(rows, filter) {
    var today = todayISO();
    if (filter === 'today') {
      return rows.filter(function (row) { return row.date === today; });
    }
    if (filter === 'tomorrow') {
      var tomorrow = tomorrowISO();
      return rows.filter(function (row) { return row.date === tomorrow; });
    }
    if (filter === 'upcoming') {
      return rows.filter(function (row) { return row.date >= today; });
    }
    return rows;
  }

  function renderStats() {
    var today = todayISO();
    var todayRows = appointments.filter(function (row) { return row.date === today; });
    var upcoming = appointments.filter(function (row) { return row.date >= today; });
    var revenue = todayRows.reduce(function (sum, row) { return sum + (row.total || 0); }, 0);

    el.statToday.textContent = String(todayRows.length);
    el.statUpcoming.textContent = String(upcoming.length);
    el.statAll.textContent = String(appointments.length);
    el.statRevenue.textContent = Booking.formatPrice(revenue);
  }

  function renderAppointment(row) {
    var card = createEl('article', 'appointment' + (row.date === todayISO() ? ' appointment--today' : ''));
    card.dataset.id = row.id;

    var head = createEl('div', 'appointment__head');
    head.appendChild(createEl('span', 'appointment__when',
      Booking.formatDateLong(row.date) + ' · ' + row.time));
    head.appendChild(createEl('span', 'appointment__total', Booking.formatPrice(row.total || 0)));
    card.appendChild(head);

    card.appendChild(createEl('p', 'appointment__name', row.customerName || '—'));

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
      card.appendChild(createEl('p', 'appointment__line', 'Süre: yakl. ' + row.duration + ' dk'));
    }

    var actions = createEl('div', 'appointment__actions');
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
    var rows = filterRows(appointments, activeFilter);
    el.title.textContent = FILTER_TITLES[activeFilter];
    el.list.innerHTML = '';

    if (!rows.length) {
      el.list.appendChild(createEl('p', 'empty', EMPTY_TEXTS[activeFilter]));
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
      .then(function (rows) { appointments = rows; render(); })
      .catch(function (err) {
        console.error(err);
        appointments = [];
        render();
      });
  }

  function onFilterClick(event) {
    var button = event.target.closest('.filter');
    if (!button) return;

    activeFilter = button.dataset.filter;
    Array.prototype.forEach.call(el.filters.querySelectorAll('.filter'), function (item) {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
    });
    renderList();
  }

  function onListClick(event) {
    var button = event.target.closest('[data-action="delete"]');
    if (!button) return;

    var id = button.dataset.id;
    var row = appointments.filter(function (item) { return item.id === id; })[0];
    if (!row) return;

    var confirmed = window.confirm(
      (row.customerName || 'Bu randevu') + ' — ' +
      Booking.formatDateLong(row.date) + ' ' + row.time +
      '\n\nRandevuyu silmek istediğinize emin misiniz?'
    );
    if (!confirmed) return;

    Store.remove(id)
      .then(function () { return load(); })
      .then(function () { showNotice('Randevu silindi.'); })
      .catch(function (err) {
        console.error(err);
        showNotice('Randevu silinemedi.');
      });
  }

  function init() {
    el.filters = $('filters');
    el.list = $('appointment-list');
    el.title = $('list-title');
    el.notice = $('admin-notice');
    el.statToday = $('stat-today');
    el.statUpcoming = $('stat-upcoming');
    el.statAll = $('stat-all');
    el.statRevenue = $('stat-revenue');

    el.filters.addEventListener('click', onFilterClick);
    el.list.addEventListener('click', onListClick);

    /* Müşteri sayfası başka sekmede randevu oluşturursa liste tazelensin */
    window.addEventListener('storage', function (event) {
      if (event.key && event.key !== Store.STORAGE_KEY) return;
      load();
    });

    load();

    window.MelekAdmin = {
      reload: load,
      getFilter: function () { return activeFilter; },
      getAppointments: function () { return appointments.slice(); }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
