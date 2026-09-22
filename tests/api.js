/*
 * tests/api.js — Backend API testleri.
 * Sunucuyu geçici bir veritabanıyla kendi içinde başlatır.
 *
 * Çalıştırma:  node tests/api.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/* Sunucu ayarları require'dan ÖNCE verilmeli */
const TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'melek-test-')), 'test.db');
const PORT = 3199;
const PASSWORD = 'test-sifresi-123';

process.env.PORT = String(PORT);
process.env.MELEK_DB = TEST_DB;
process.env.MELEK_ADMIN_PASSWORD = PASSWORD;
process.env.MELEK_LOGIN_MAX_ATTEMPTS = '5';

const server = require('../server/server.js');
const Booking = require('../js/booking.js');

const BASE = 'http://127.0.0.1:' + PORT;
let passed = 0, failed = 0;
let cookie = '';

function check(label, ok, detail) {
  ok ? passed++ : failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (!ok && detail ? '  -> ' + detail : ''));
}
function eq(label, got, want) {
  check(label, JSON.stringify(got) === JSON.stringify(want),
    `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function section(name) { console.log('\n' + name); }

async function api(method, url, body, options) {
  const opts = options || {};
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie && !opts.noCookie) headers.Cookie = cookie;

  const res = await fetch(BASE + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie && !opts.keepCookie) cookie = setCookie.split(';')[0];

  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch (err) { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const iso = (offsetDays) => Booking.toISODate(Booking.addDays(new Date(), offsetDays));

(async () => {
  await new Promise((resolve) => { server.server.listen(PORT, '127.0.0.1', resolve); });
  require('../server/db.js').open();

  const day = iso(2);
  const otherDay = iso(3);

  /* ============================ GENEL UÇLAR =========================== */

  section('Genel uçlar');
  let r = await api('GET', '/api/health');
  eq('health 200', r.status, 200);
  eq('mode api', r.data.mode, 'api');

  r = await api('GET', '/api/services');
  eq('hizmet katalogu 200', r.status, 200);
  eq('4 kategori', r.data.categories.length, 4);
  eq('16 saat dilimi', r.data.timeSlots.length, 16);
  eq('salon adı', r.data.salon.name, 'Melek Güzellik Salonu');

  r = await api('GET', '/api/days');
  eq('14 gün', r.data.days.length, 14);
  eq('ilk gün bugün', r.data.days[0].isToday, true);

  r = await api('GET', `/api/availability?date=${day}&duration=45`);
  eq('uygunluk 200', r.status, 200);
  eq('16 saat', r.data.slots.length, 16);
  eq('hepsi boş', r.data.slots.every((s) => s.available), true);

  r = await api('GET', '/api/availability?date=gecersiz');
  eq('geçersiz tarih 400', r.status, 400);

  /* ========================= RANDEVU OLUŞTURMA ======================== */

  section('Randevu oluşturma');
  r = await api('POST', '/api/appointments', {
    serviceIds: ['manikur'], date: day, time: '14:00',
    customerName: 'Ayşe Yılmaz', phone: '0555 123 4567', note: 'İlk seansım'
  });
  eq('oluşturuldu 201', r.status, 201);
  eq('hizmet etiketi', r.data.appointment.serviceLabel, 'Manikür');
  eq('toplam sunucudan', r.data.appointment.total, 500);
  eq('süre sunucudan', r.data.appointment.duration, 45);
  const firstId = r.data.appointment.id;

  section('GÜVENLİK — fiyat istemciden alınmaz');
  r = await api('POST', '/api/appointments', {
    serviceIds: ['lazer-tum-vucut'], date: day, time: '16:00',
    customerName: 'Sahte Fiyat', phone: '05550000000',
    total: 1, duration: 5, serviceLabel: 'BEDAVA', regions: ['hack'],
    services: [{ name: 'x', price: 1 }]
  });
  eq('kayıt kabul edildi', r.status, 201);
  eq('fiyat katalogdan hesaplandı', r.data.appointment.total, 1500);
  eq('süre katalogdan hesaplandı', r.data.appointment.duration, 120);
  eq('etiket katalogdan', r.data.appointment.serviceLabel, 'Lazer Epilasyon');
  eq('bölgeler katalogdan', r.data.appointment.regions, ['Tüm Vücut Tek Seans']);

  section('GÜVENLİK — uygunluk kişisel veri sızdırmaz');
  r = await api('GET', `/api/availability?date=${day}&duration=30`);
  const body = JSON.stringify(r.data);
  check('isim sızmıyor', !body.includes('Ayşe'), body.slice(0, 120));
  check('telefon sızmıyor', !body.includes('0555'), body.slice(0, 120));
  check('not sızmıyor', !body.includes('seansım'), body.slice(0, 120));
  eq('slot anahtarları', Object.keys(r.data.slots[0]).sort(), ['available', 'reason', 'time']);

  section('Çakışma');
  r = await api('POST', '/api/appointments', {
    serviceIds: ['pedikur'], date: day, time: '14:00',
    customerName: 'Zeynep Kaya', phone: '05559998877'
  });
  eq('aynı saat 409', r.status, 409);
  eq('çakışma mesajı', r.data.error, Booking.CONFLICT_MESSAGE);

  r = await api('POST', '/api/appointments', {
    serviceIds: ['pedikur'], date: day, time: '14:30',
    customerName: 'Zeynep Kaya', phone: '05559998877'
  });
  eq('süreye denk gelen saat 409', r.status, 409);

  r = await api('POST', '/api/appointments', {
    serviceIds: ['pedikur'], date: day, time: '15:00',
    customerName: 'Zeynep Kaya', phone: '05559998877'
  });
  eq('boş saat 201', r.status, 201);

  r = await api('GET', `/api/availability?date=${day}&duration=30`);
  const busy = r.data.slots.filter((s) => !s.available).map((s) => s.time);
  eq('dolu saatler', busy, ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']);

  section('Eşzamanlı istek (yarış durumu)');
  const raceResults = await Promise.all([1, 2, 3, 4, 5].map(() =>
    api('POST', '/api/appointments', {
      serviceIds: ['kas-biyik'], date: otherDay, time: '11:00',
      customerName: 'Yarış Testi', phone: '05551112233'
    })
  ));
  eq('yalnızca bir kayıt başarılı',
    raceResults.filter((x) => x.status === 201).length, 1);
  eq('diğerleri 409',
    raceResults.filter((x) => x.status === 409).length, 4);

  section('Doğrulama');
  const invalid = [
    [{ serviceIds: [], date: day, time: '10:00', customerName: 'Ad Soyad', phone: '05551234567' }, 'hizmetsiz'],
    [{ serviceIds: ['yok-boyle-hizmet'], date: day, time: '10:00', customerName: 'Ad Soyad', phone: '05551234567' }, 'geçersiz hizmet'],
    [{ serviceIds: ['manikur'], date: 'abc', time: '10:00', customerName: 'Ad Soyad', phone: '05551234567' }, 'geçersiz tarih'],
    [{ serviceIds: ['manikur'], date: day, time: '09:13', customerName: 'Ad Soyad', phone: '05551234567' }, 'listede olmayan saat'],
    [{ serviceIds: ['manikur'], date: day, time: '10:00', customerName: '', phone: '05551234567' }, 'isimsiz'],
    [{ serviceIds: ['manikur'], date: day, time: '10:00', customerName: 'Ad Soyad', phone: '123' }, 'kısa telefon'],
    [{ serviceIds: ['manikur'], date: iso(-1), time: '10:00', customerName: 'Ad Soyad', phone: '05551234567' }, 'geçmiş tarih'],
    [{ serviceIds: ['manikur'], date: iso(90), time: '10:00', customerName: 'Ad Soyad', phone: '05551234567' }, 'çok ileri tarih']
  ];
  for (const [payload, label] of invalid) {
    const res = await api('POST', '/api/appointments', payload);
    eq(label + ' reddedilir', res.status, 400);
  }

  r = await api('POST', '/api/appointments', {
    serviceIds: ['manikur', 'pedikur'], date: otherDay, time: '13:00',
    customerName: 'Kural Testi', phone: '05551234567'
  });
  eq('kategori kuralı sunucuda uygulanır (tek seçim)', r.data.appointment.serviceLabel, 'Pedikür');
  eq('kural sonrası fiyat', r.data.appointment.total, 600);

  /* ============================ YÖNETİCİ ============================= */

  section('GÜVENLİK — yönetici uçları giriş ister');
  for (const [method, url] of [
    ['GET', '/api/admin/appointments'],
    ['POST', '/api/admin/appointments'],
    ['PATCH', '/api/admin/appointments/' + firstId],
    ['DELETE', '/api/admin/appointments/' + firstId],
    ['POST', '/api/admin/appointments/import']
  ]) {
    const res = await api(method, url, method === 'GET' ? undefined : {});
    eq(`${method} ${url.replace('/api/admin', '')} -> 401`, res.status, 401);
  }

  section('Giriş');
  r = await api('POST', '/api/admin/login', { passcode: 'yanlis' });
  eq('yanlış şifre 401', r.status, 401);
  eq('çerez verilmedi', r.headers.get('set-cookie'), null);

  r = await api('POST', '/api/admin/login', { passcode: PASSWORD });
  eq('doğru şifre 200', r.status, 200);
  const setCookie = r.headers.get('set-cookie');
  check('HttpOnly çerez', /HttpOnly/i.test(setCookie), setCookie);
  check('SameSite=Lax', /SameSite=Lax/i.test(setCookie), setCookie);
  check('şifre çerezde değil', !setCookie.includes(PASSWORD), setCookie);

  r = await api('GET', '/api/admin/session');
  eq('oturum açık', r.data.signedIn, true);

  section('Yönetici işlemleri');
  r = await api('GET', '/api/admin/appointments');
  eq('liste 200', r.status, 200);
  /* 5 kayıt: Ayşe 14:00, Sahte Fiyat 16:00, Zeynep 15:00, yarış testi, kural testi */
  eq('kayıt sayısı', r.data.appointments.length, 5);
  check('tarih-saate göre sıralı', (() => {
    const keys = r.data.appointments.map((a) => a.date + ' ' + a.time);
    return JSON.stringify(keys) === JSON.stringify([...keys].sort());
  })(), 'sıralama bozuk');
  check('yönetici kişisel veriyi görür',
    r.data.appointments.some((a) => a.customerName === 'Ayşe Yılmaz' && a.phone === '05551234567'));
  eq('istatistikler var', Object.keys(r.data.stats).sort(),
    ['all', 'today', 'todayRevenue', 'upcoming']);

  r = await api('POST', '/api/admin/appointments', {
    serviceIds: ['kirpik-lifting'], date: otherDay, time: '16:00',
    customerName: 'Fatma Demir', phone: '05551112233', note: 'Telefonla arandı'
  });
  eq('yönetici randevu ekler 201', r.status, 201);
  eq('kaynak admin', r.data.appointment.source, 'admin');
  const adminId = r.data.appointment.id;

  r = await api('PATCH', '/api/admin/appointments/' + adminId, { status: 'done' });
  eq('durum güncellendi', r.data.appointment.status, 'done');
  r = await api('PATCH', '/api/admin/appointments/' + adminId, { status: null });
  eq('durum kaldırıldı', r.data.appointment.status, null);
  r = await api('PATCH', '/api/admin/appointments/' + adminId, { status: 'sacma-deger' });
  eq('geçersiz durum 400', r.status, 400);
  r = await api('PATCH', '/api/admin/appointments/apt_yok', { status: 'done' });
  eq('olmayan kayıt 404', r.status, 404);

  section('Yedekleme ve geri yükleme');
  r = await api('GET', '/api/admin/appointments');
  const backup = r.data.appointments;
  eq('yedek alındı', backup.length, 6);

  r = await api('POST', '/api/admin/appointments/import', { appointments: backup.slice(0, 2) });
  eq('geri yükleme 200', r.status, 200);
  eq('2 kayıt yüklendi', r.data.restored, 2);
  r = await api('GET', '/api/admin/appointments');
  eq('liste 2 kayda düştü', r.data.appointments.length, 2);
  check('fiyat yedekten korundu', r.data.appointments.every((a) => typeof a.total === 'number'));

  r = await api('POST', '/api/admin/appointments/import', { appointments: 'bozuk' });
  eq('bozuk yedek 400', r.status, 400);

  section('Silme');
  const deleteId = (await api('GET', '/api/admin/appointments')).data.appointments[0].id;
  r = await api('DELETE', '/api/admin/appointments/' + deleteId);
  eq('silindi', r.data.deleted, true);
  r = await api('GET', '/api/admin/appointments');
  eq('liste 1 kayda düştü', r.data.appointments.length, 1);
  r = await api('DELETE', '/api/admin/appointments/' + deleteId);
  eq('tekrar silme 404', r.status, 404);

  section('Çıkış');
  r = await api('POST', '/api/admin/logout');
  eq('çıkış 200', r.status, 200);
  r = await api('GET', '/api/admin/session');
  eq('oturum kapandı', r.data.signedIn, false);
  r = await api('GET', '/api/admin/appointments');
  eq('çıkış sonrası 401', r.status, 401);

  section('GÜVENLİK — sahte oturum anahtarı');
  cookie = 'melek_session=' + 'a'.repeat(64);
  r = await api('GET', '/api/admin/appointments');
  eq('uydurma anahtar reddedilir', r.status, 401);
  cookie = '';

  section('GÜVENLİK — giriş deneme sınırı');
  let limited = 0;
  for (let i = 0; i < 8; i++) {
    const res = await api('POST', '/api/admin/login', { passcode: 'yanlis-' + i });
    if (res.status === 429) limited++;
  }
  check('sınıra takıldı', limited > 0, 'hiç 429 dönmedi');
  r = await api('POST', '/api/admin/login', { passcode: PASSWORD });
  eq('sınır doğru şifreyi de engeller', r.status, 429);

  /* ======================== STATİK VE KORUMA ========================= */

  section('GÜVENLİK — statik dosya koruması');
  for (const [target, label] of [
    ['/data/melek.db', 'veritabanı'],
    ['/server/config.js', 'sunucu kodu'],
    ['/server/auth.js', 'auth kodu'],
    ['/tests/api.js', 'testler'],
    ['/js/../server/db.js', 'yol atlatma'],
    ['/.git/config', 'git dizini']
  ]) {
    const res = await fetch(BASE + target, { redirect: 'manual' });
    eq(label + ' erişilemez (404)', res.status, 404);
  }

  for (const [target, label] of [
    ['/index.html', 'randevu sayfası'],
    ['/', 'kök adres'],
    ['/admin/', 'yönetici paneli'],
    ['/css/style.css', 'stil dosyası'],
    ['/js/app.js', 'uygulama kodu']
  ]) {
    const res = await fetch(BASE + target, { redirect: 'manual' });
    eq(label + ' sunulur (200)', res.status, 200);
  }

  const headerRes = await fetch(BASE + '/index.html');
  eq('nosniff başlığı', headerRes.headers.get('x-content-type-options'), 'nosniff');
  eq('frame koruması', headerRes.headers.get('x-frame-options'), 'SAMEORIGIN');

  section('Hatalı istekler');
  r = await api('GET', '/api/bilinmeyen');
  eq('olmayan uç 404', r.status, 404);
  r = await api('DELETE', '/api/health');
  eq('yanlış yöntem 405', r.status, 405);
  const badJson = await fetch(BASE + '/api/appointments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bozuk'
  });
  eq('bozuk JSON 400', badJson.status, 400);

  /* ------------------------------- bitir ------------------------------- */
  await server.stop();
  fs.rmSync(path.dirname(TEST_DB), { recursive: true, force: true });

  console.log('\n================ SONUÇ ================');
  console.log(`Geçen: ${passed}   Başarısız: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  try { await server.stop(); } catch (e) { /* yoksayılır */ }
  process.exit(1);
});
