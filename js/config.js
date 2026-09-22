/*
 * config.js — SALON AYARLARI
 *
 * Günlük kullanımda değiştirmeniz gereken her şey bu dosyadadır.
 * Fiyat ve hizmet listesi için js/data.js dosyasına bakın.
 */
(function (global) {
  'use strict';

  var MelekConfig = {

    /* ---------------------------------------------------------------
     * SALON BİLGİLERİ
     * ------------------------------------------------------------- */
    salon: {
      name: 'Melek Güzellik Salonu',
      /* Sayfalarda görünen numara */
      phoneDisplay: '0555 191 8058',
      /* Tıklanınca aranacak numara — uluslararası format */
      phoneLink: 'tel:+905551918058'
    },

    /* ---------------------------------------------------------------
     * YÖNETİCİ PANELİ ŞİFRESİ
     *
     * !! MUTLAKA DEĞİŞTİRİN !!
     * Bu şifre yalnızca paneli meraklı gözlerden uzak tutar.
     * Tarayıcıda çalıştığı için gerçek bir güvenlik önlemi DEĞİLDİR.
     * Ayrıntı için README.md > "Güvenlik" bölümüne bakın.
     * ------------------------------------------------------------- */
    adminPasscode: 'melek2026',

    /* ---------------------------------------------------------------
     * ÇALIŞMA DÜZENİ
     * ------------------------------------------------------------- */

    /* Randevu verilebilecek saatler */
    timeSlots: [
      '10:00', '10:30', '11:00', '11:30', '12:00',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30', '18:00'
    ],

    /* Müşteriye kaç günlük takvim gösterilsin */
    bookableDays: 14,

    /*
     * Salonun kapalı olduğu haftanın günleri.
     * 0 = Pazar, 1 = Pazartesi, ... 6 = Cumartesi
     * Örnek — pazar günleri kapalıysa:  closedWeekdays: [0]
     * Boş bırakılırsa her gün açıktır.
     */
    closedWeekdays: [],

    /*
     * Belirli tarihlerde kapalıysanız (tatil, izin) buraya ekleyin.
     * Örnek: ['2026-10-29', '2027-01-01']
     */
    closedDates: [],

    /*
     * Randevunun en az kaç dakika öncesinden alınabileceği.
     * 0  = o anki saatten sonraki tüm saatler seçilebilir
     * 60 = en erken 1 saat sonrasına randevu verilebilir
     */
    minimumNoticeMinutes: 0
  };

  global.MelekConfig = MelekConfig;
  if (typeof module !== 'undefined' && module.exports) module.exports = MelekConfig;
})(typeof window !== 'undefined' ? window : globalThis);
