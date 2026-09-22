/*
 * data.js — Melek Güzellik Salonu
 * Salon bilgileri, hizmet katalogu, çalışma saatleri.
 * Bu dosya saf veridir; DOM veya depolama ile ilgisi yoktur.
 */
(function (global) {
  'use strict';

  var Config = global.MelekConfig ||
    (typeof require !== 'undefined' ? require('./config.js') : null);

  var SALON = Config.salon;

  /*
   * selection: 'multi'  -> aynı anda birden fazla hizmet seçilebilir (lazer)
   *            'single' -> kategori içinde tek hizmet seçilebilir
   * exclusive: true     -> seçildiğinde kendi kategorisindeki diğer seçimleri kaldırır
   * duration            -> dakika cinsinden yaklaşık süre (randevu çakışması için kullanılır)
   */
  var CATEGORIES = [
    {
      id: 'lazer',
      name: 'Lazer Epilasyon',
      note: 'Birden fazla bölge seçebilirsiniz.',
      selection: 'multi',
      itemLabel: 'Bölgeler',
      services: [
        { id: 'lazer-tum-yuz',     name: 'Tüm Yüz',              price: 400,  duration: 30 },
        { id: 'lazer-cene',        name: 'Çene',                 price: 100,  duration: 15 },
        { id: 'lazer-biyik',       name: 'Bıyık',                price: 100,  duration: 15 },
        { id: 'lazer-tum-kol',     name: 'Tüm Kol',              price: 500,  duration: 45 },
        { id: 'lazer-yarim-kol',   name: 'Yarım Kol',            price: 250,  duration: 30 },
        { id: 'lazer-tum-bacak',   name: 'Tüm Bacak',            price: 600,  duration: 60 },
        { id: 'lazer-yarim-bacak', name: 'Yarım Bacak',          price: 300,  duration: 30 },
        { id: 'lazer-koltuk-alti', name: 'Koltuk Altı',          price: 300,  duration: 20 },
        { id: 'lazer-ozel-bolge',  name: 'Özel Bölge',           price: 500,  duration: 30 },
        { id: 'lazer-gobek',       name: 'Göbek',                price: 200,  duration: 20 },
        { id: 'lazer-gogus',       name: 'Göğüs',                price: 200,  duration: 25 },
        { id: 'lazer-sirt',        name: 'Sırt',                 price: 300,  duration: 30 },
        { id: 'lazer-tum-vucut',   name: 'Tüm Vücut Tek Seans',  price: 1500, duration: 120, exclusive: true }
      ]
    },
    {
      id: 'el-ayak',
      name: 'El & Ayak',
      selection: 'single',
      services: [
        { id: 'manikur', name: 'Manikür', price: 500, duration: 45 },
        { id: 'pedikur', name: 'Pedikür', price: 600, duration: 60 }
      ]
    },
    {
      id: 'cilt',
      name: 'Cilt Bakımı',
      selection: 'single',
      services: [
        { id: 'cilt-bakimi',        name: 'Cilt Bakımı',                  price: 1000, duration: 60 },
        { id: 'klasik-cilt-bakimi', name: 'Klasik Cilt Bakımı',           price: 1000, duration: 60 },
        { id: 'hydrafacial',        name: 'Hydrafacial Cilt Bakımı 1+1',  price: 1310, duration: 90 }
      ]
    },
    {
      id: 'kas-kirpik',
      name: 'Kaş & Kirpik',
      selection: 'single',
      services: [
        { id: 'kas-biyik',       name: 'Kaş Bıyık',      price: 350, duration: 30 },
        { id: 'biyik-alimi',     name: 'Bıyık Alımı',    price: 100, duration: 15 },
        { id: 'kirpik-lifting',  name: 'Kirpik Lifting', price: 800, duration: 60 }
      ]
    }
  ];

  /* Çalışma düzeni config.js'ten okunur */
  var TIME_SLOTS = Config.timeSlots;
  var BOOKABLE_DAYS = Config.bookableDays;

  var WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  var MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  var MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
                     'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  /* Hızlı erişim için hizmet indeksi (id -> { service, category }) */
  var SERVICE_INDEX = {};
  CATEGORIES.forEach(function (category) {
    category.services.forEach(function (service) {
      SERVICE_INDEX[service.id] = { service: service, category: category };
    });
  });

  function getService(serviceId) {
    var entry = SERVICE_INDEX[serviceId];
    return entry ? entry.service : null;
  }

  function getCategoryOfService(serviceId) {
    var entry = SERVICE_INDEX[serviceId];
    return entry ? entry.category : null;
  }

  function getCategory(categoryId) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === categoryId) return CATEGORIES[i];
    }
    return null;
  }

  var MelekData = {
    CONFIG: Config,
    SALON: SALON,
    CATEGORIES: CATEGORIES,
    TIME_SLOTS: TIME_SLOTS,
    BOOKABLE_DAYS: BOOKABLE_DAYS,
    WEEKDAYS_SHORT: WEEKDAYS_SHORT,
    MONTHS_SHORT: MONTHS_SHORT,
    MONTHS_LONG: MONTHS_LONG,
    getService: getService,
    getCategory: getCategory,
    getCategoryOfService: getCategoryOfService
  };

  global.MelekData = MelekData;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekData;
})(typeof window !== 'undefined' ? window : globalThis);
