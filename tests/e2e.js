/*
 * tests/e2e.js — Uçtan uca tarayıcı testleri (Playwright + Chromium).
 *
 * Çalıştırma:
 *   1. terminal:  python3 -m http.server 8123
 *   2. terminal:  node tests/e2e.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
let passed = 0, failed = 0;
const consoleErrors = [];

function check(label, ok, detail) {
  ok ? passed++ : failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label + (!ok && detail ? '  -> ' + detail : ''));
}
function eq(label, got, want) {
  check(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function section(name) { console.log('\n' + name); }

function watch(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(tag + ' :: ' + m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(tag + ' :: pageerror: ' + e.message));
}

/* ------------------------------ yardımcılar ------------------------------ */

const clickService = (page, name) =>
  page.locator('.option__name', { hasText: new RegExp('^' + name + '$') }).first().click();

const total = (page) => page.locator('#total-price').innerText();

const notice = async (page) =>
  (await page.locator('#notice').isVisible()) ? page.locator('#notice').innerText() : '';

async function visibleStep(page) {
  for (const n of [1, 2, 3, 4]) {
    if (await page.locator('#step-' + n).isVisible()) return n;
  }
  return 0;
}

async function pickOpenSlot(page) {
  const slot = page.locator('.slot:not([disabled])').first();
  const time = await slot.innerText();
  await slot.click();
  return time;
}

const clearStore = (page) => page.evaluate(() => {
  localStorage.removeItem('melekAppointments');
  sessionStorage.removeItem('melekAdminSession');
});

const readStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('melekAppointments') || '[]'));

const seedStore = (page, rows) =>
  page.evaluate((r) => localStorage.setItem('melekAppointments', JSON.stringify(r)), rows);

async function adminLogin(page, passcode) {
  const code = passcode !== undefined
    ? passcode
    : await page.evaluate(() => window.MelekConfig.adminPasscode);
  await page.fill('#gate-passcode', code);
  await page.click('#gate-form button[type="submit"]');
}

/* Paneli açar; giriş ekranı çıkarsa şifreyi girer */
async function openAdmin(page) {
  await page.goto(BASE + '/admin/index.html');
  await page.waitForSelector('#gate:not([hidden]), #panel:not([hidden])');
  if (await page.locator('#gate').isVisible()) await adminLogin(page);
  await page.waitForSelector('#panel:not([hidden])');
}

/* Müşteri tarafında baştan sona bir randevu oluşturur */
async function bookAppointment(page, { service, name, phone, note, dayIndex = 1 }) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clickService(page, service);
  await page.click('#btn-next');
  await page.locator('.day:not([disabled])').nth(dayIndex).click();
  const date = await page.locator('.day[aria-pressed="true"]').getAttribute('data-date');
  const time = await pickOpenSlot(page);
  await page.click('#btn-next');
  await page.fill('#customer-name', name);
  await page.fill('#customer-phone', phone);
  if (note) await page.fill('#customer-note', note);
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  return { date, time };
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true
  });
  const page = await context.newPage();
  watch(page, 'musteri');

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clearStore(page);
  await page.reload();
  await page.waitForSelector('.option');

  /* ==================== ADIM 1 — HİZMET SEÇİMİ ==================== */

  section('Adım 1 — başlangıç durumu');
  eq('Geri butonu gizli', await page.locator('#btn-back').isVisible(), false);
  eq('buton metni', await page.locator('#btn-next').innerText(), 'Tarih ve Saat Seç');
  eq('seçim özeti gizli', await page.locator('#chips').isVisible(), false);
  eq('4 kategori', await page.locator('.category').count(), 4);
  eq('21 hizmet', await page.locator('.option').count(), 21);

  section('TEST 6 — Hizmet seçmeden devam engellenmeli');
  await page.click('#btn-next');
  eq('uyarı mesajı', await notice(page), 'Lütfen önce bir hizmet seçin.');
  eq('adım 1\'de kalır', await visibleStep(page), 1);

  section('TEST 2 — Tüm Yüz + Çene + Bıyık = 600 TL');
  for (const s of ['Tüm Yüz', 'Çene', 'Bıyık']) await clickService(page, s);
  eq('toplam', await total(page), '600 TL');
  eq('3 kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 3);
  eq('seçim özeti görünür', await page.locator('#chips').isVisible(), true);
  eq('3 etiket', await page.locator('.chip').count(), 3);
  eq('tahmini süre', await page.locator('#total-meta').innerText(), 'yakl. 1 sa');

  section('TEST 3 — Tüm Kol + Tüm Bacak + Sırt = 1400 TL');
  await page.click('#clear-all');
  eq('temizlendi', await total(page), '0 TL');
  eq('özet gizlendi', await page.locator('#chips').isVisible(), false);
  for (const s of ['Tüm Kol', 'Tüm Bacak', 'Sırt']) await clickService(page, s);
  eq('toplam', await total(page), '1400 TL');

  section('TEST 4 — Tüm Vücut diğer lazer seçimlerini kaldırır');
  await clickService(page, 'Tüm Vücut Tek Seans');
  eq('toplam', await total(page), '1500 TL');
  eq('tek kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 1);
  eq('seçili olan',
    await page.locator('.option[aria-pressed="true"] .option__name').innerText(), 'Tüm Vücut Tek Seans');

  section('TEST 5 — Tüm Vücut seçiliyken Çene seçilirse Tüm Vücut kalkar');
  await clickService(page, 'Çene');
  eq('toplam', await total(page), '100 TL');
  eq('tek kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 1);
  eq('seçili olan',
    await page.locator('.option[aria-pressed="true"] .option__name').innerText(), 'Çene');

  section('Seçim etiketiyle kaldırma');
  await clickService(page, 'Manikür');
  eq('iki seçim', await total(page), '600 TL');
  await page.locator('.chip', { hasText: 'Çene' }).click();
  eq('etiketten kaldırıldı', await total(page), '500 TL');
  eq('kart da güncellendi', await page.locator('.option[aria-pressed="true"]').count(), 1);
  await page.click('#clear-all');

  /* ==================== ADIM 2 — TARİH VE SAAT ==================== */

  section('TEST 1 — Manikür ile uçtan uca randevu');
  await clickService(page, 'Manikür');
  eq('toplam', await total(page), '500 TL');
  await page.click('#btn-next');
  eq('adım 2 açıldı', await visibleStep(page), 2);
  eq('Geri görünür', await page.locator('#btn-back').isVisible(), true);
  eq('buton metni', await page.locator('#btn-next').innerText(), 'Bilgilerime Geç');
  eq('14 gün listelenir', await page.locator('.day').count(), 14);

  section('Adım göstergesinden geri dönüş');
  await page.locator('.stepper__btn[data-goto="1"]').click();
  eq('adım 1\'e döndü', await visibleStep(page), 1);
  eq('seçim korundu', await total(page), '500 TL');
  await page.click('#btn-next');

  section('TEST 7 — Tarih seçmeden saat seçilemez');
  eq('saat kartı yok', await page.locator('.slot').count(), 0);
  eq('ipucu görünür', await page.locator('#time-hint').innerText(),
    'Saatleri görmek için önce bir tarih seçin.');

  section('TEST 8 — Saat seçmeden devam engellenmeli');
  await page.click('#btn-next');
  eq('tarih uyarısı', await notice(page), 'Lütfen bir tarih seçin.');
  await page.locator('.day').nth(1).click();
  eq('16 saat kartı', await page.locator('.slot').count(), 16);
  await page.click('#btn-next');
  eq('saat uyarısı', await notice(page), 'Lütfen bir saat seçin.');
  eq('adım 2\'de kalır', await visibleStep(page), 2);

  section('Kapalı gün seçilemez');
  const targetDate = await page.locator('.day').nth(3).getAttribute('data-date');
  await page.evaluate((d) => { window.MelekConfig.closedDates = [d]; }, targetDate);
  await page.locator('.stepper__btn[data-goto="1"]').click();
  await page.click('#btn-next');
  const closedDay = page.locator(`.day[data-date="${targetDate}"]`);
  eq('kapalı gün devre dışı', await closedDay.isDisabled(), true);
  eq('kapalı etiketi', await closedDay.locator('.day__month').innerText(), 'Kapalı');
  await page.evaluate(() => { window.MelekConfig.closedDates = []; });
  await page.locator('.stepper__btn[data-goto="1"]').click();
  await page.click('#btn-next');
  eq('ayar geri alındı',
    await page.locator(`.day[data-date="${targetDate}"]`).isDisabled(), false);

  /* ==================== ADIM 3 — BİLGİLER ==================== */

  await page.locator('.day').nth(1).click();
  const firstDate = await page.locator('.day[aria-pressed="true"]').getAttribute('data-date');
  const firstTime = await pickOpenSlot(page);
  await page.click('#btn-next');
  eq('adım 3 açıldı', await visibleStep(page), 3);
  eq('aksiyon çubuğu gizli', await page.locator('#actionbar').isVisible(), false);

  const summaryText = await page.locator('#summary').innerText();
  check('özette hizmet', summaryText.includes('Manikür'), summaryText);
  check('özette saat', summaryText.includes(firstTime), summaryText);
  check('özette süre', summaryText.includes('45 dk'), summaryText);
  check('özette toplam', summaryText.includes('500 TL'), summaryText);

  section('Form doğrulaması');
  await page.click('#submit-appointment');
  eq('ad soyad uyarısı', await notice(page), 'Lütfen ad ve soyadınızı girin.');
  eq('hatalı alan işaretli',
    await page.locator('#customer-name').getAttribute('aria-invalid'), 'true');
  eq('adım 3\'te kalır', await visibleStep(page), 3);

  await page.fill('#customer-name', 'Ayşe Yılmaz');
  await page.click('#submit-appointment');
  eq('telefon uyarısı', await notice(page), 'Lütfen telefon numaranızı girin.');
  await page.fill('#customer-phone', '555');
  await page.click('#submit-appointment');
  eq('kısa telefon uyarısı', await notice(page), 'Telefon numarası en az 10 haneli olmalıdır.');
  eq('telefon input tipi', await page.locator('#customer-phone').getAttribute('type'), 'tel');
  eq('telefon klavyesi', await page.locator('#customer-phone').getAttribute('inputmode'), 'tel');

  /* ==================== ADIM 4 — ONAY ==================== */

  section('Randevu oluşturma');
  const urlBefore = page.url();
  await page.fill('#customer-phone', '0555 123 4567');
  await page.fill('#customer-note', 'İlk seansım');
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  eq('adım 4 açıldı', await visibleStep(page), 4);
  eq('sayfa yenilenmedi', page.url(), urlBefore);
  eq('onay başlığı', await page.locator('#step-4-title').innerText(), 'Randevunuz oluşturuldu.');
  eq('aksiyon çubuğu gizli', await page.locator('#actionbar').isVisible(), false);

  const confirmText = await page.locator('#confirm-summary').innerText();
  check('onayda hizmet', confirmText.includes('Manikür'), confirmText);
  check('onayda toplam', confirmText.includes('500 TL'), confirmText);

  let stored = await readStore(page);
  eq('kayıt sayısı', stored.length, 1);
  eq('müşteri adı', stored[0].customerName, 'Ayşe Yılmaz');
  eq('telefon normalize', stored[0].phone, '05551234567');
  eq('not kaydedildi', stored[0].note, 'İlk seansım');
  eq('toplam', stored[0].total, 500);
  eq('süre', stored[0].duration, 45);
  eq('tarih', stored[0].date, firstDate);
  eq('saat', stored[0].time, firstTime);

  section('Takvime ekleme (.ics)');
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.click('#add-to-calendar')
  ]).then(([d]) => d);
  eq('dosya adı', download.suggestedFilename(), 'melek-randevu-' + firstDate + '.ics');
  const icsPath = path.join(os.tmpdir(), 'melek-test.ics');
  await download.saveAs(icsPath);
  const icsBody = fs.readFileSync(icsPath, 'utf8');
  check('geçerli takvim dosyası',
    icsBody.includes('BEGIN:VCALENDAR') && icsBody.includes('END:VCALENDAR'), icsBody.slice(0, 60));
  check('randevu saatini içerir', icsBody.includes('DTSTART:' + firstDate.replace(/-/g, '')), icsBody);
  fs.unlinkSync(icsPath);

  /* ==================== TEST 9 — ÇAKIŞMA ==================== */

  section('TEST 9 — Aynı tarih + saate ikinci randevu engellenmeli');
  await page.click('#new-appointment');
  eq('adım 1\'e döndü', await visibleStep(page), 1);
  eq('toplam sıfırlandı', await total(page), '0 TL');
  eq('seçimler temizlendi', await page.locator('.option[aria-pressed="true"]').count(), 0);
  eq('not alanı temizlendi', await page.locator('#customer-note').inputValue(), '');

  await clickService(page, 'Kirpik Lifting');
  await page.click('#btn-next');
  await page.locator(`.day[data-date="${firstDate}"]`).click();
  const busySlot = page.locator(`.slot[data-time="${firstTime}"]`);
  eq('dolu saat devre dışı', await busySlot.isDisabled(), true);
  eq('dolu saat etiketi', await busySlot.getAttribute('aria-label'), firstTime + ' — dolu');
  await busySlot.click({ force: true });
  eq('dolu saat seçilemez', await busySlot.getAttribute('aria-pressed'), 'false');

  /* Kayıt anındaki son kontrol: araya başka randevu girerse */
  const raceTime = await pickOpenSlot(page);
  await page.evaluate(({ d, t }) => {
    const rows = JSON.parse(localStorage.getItem('melekAppointments') || '[]');
    rows.push({ id: 'race', date: d, time: t, duration: 60, total: 800,
                customerName: 'Araya Giren', phone: '05550000000',
                serviceLabel: 'Kirpik Lifting', regions: [] });
    localStorage.setItem('melekAppointments', JSON.stringify(rows));
  }, { d: firstDate, t: raceTime });
  await page.click('#btn-next');
  eq('çakışma uyarısı', await notice(page),
    'Bu saat için başka bir randevu bulunuyor. Lütfen farklı bir saat seçin.');
  eq('adım 2\'de kalır', await visibleStep(page), 2);

  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('melekAppointments') || '[]')
      .filter(r => r.id !== 'race');
    localStorage.setItem('melekAppointments', JSON.stringify(rows));
  });

  /* İkinci geçerli randevu */
  await page.locator(`.day[data-date="${firstDate}"]`).click();
  const secondTime = await pickOpenSlot(page);
  await page.click('#btn-next');
  await page.fill('#customer-name', 'Zeynep Kaya');
  await page.fill('#customer-phone', '05559998877');
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  stored = await readStore(page);
  eq('ikinci randevu kaydedildi', stored.length, 2);

  /* ==================== TEST 12 — YENİLEME ==================== */

  section('TEST 12 — Sayfa yenilendiğinde JavaScript hatası olmamalı');
  const beforeReload = consoleErrors.length;
  await page.reload();
  await page.waitForSelector('.option');
  await page.click('#btn-next');
  eq('yenileme sonrası uyarı çalışır', await notice(page), 'Lütfen önce bir hizmet seçin.');
  eq('yeni console hatası yok', consoleErrors.length, beforeReload);

  /* ==================== YÖNETİCİ PANELİ ==================== */

  const admin = await context.newPage();
  watch(admin, 'admin');

  section('Yönetici paneli — giriş koruması');
  await admin.goto(BASE + '/admin/index.html');
  await admin.waitForSelector('#gate:not([hidden])');
  eq('giriş ekranı görünür', await admin.locator('#gate').isVisible(), true);
  eq('panel gizli', await admin.locator('#panel').isVisible(), false);
  eq('randevular gizli', await admin.locator('.appointment').count(), 0);

  await adminLogin(admin, 'yanlis-sifre');
  eq('hatalı şifre reddedilir', await admin.locator('#gate-error').innerText(),
    'Şifre hatalı. Lütfen tekrar deneyin.');
  eq('panel hâlâ gizli', await admin.locator('#panel').isVisible(), false);

  await adminLogin(admin);
  await admin.waitForSelector('#panel:not([hidden])');
  eq('doğru şifre ile giriş', await admin.locator('#panel').isVisible(), true);

  section('TEST 10 — Randevular panelde görünmeli');
  await admin.click('.filter[data-filter="all"]');
  await admin.waitForSelector('.appointment');
  eq('2 randevu listelenir', await admin.locator('.appointment').count(), 2);
  const adminText = await admin.locator('#appointment-list').innerText();
  check('müşteri adı', adminText.includes('Ayşe Yılmaz'), adminText);
  check('telefon', adminText.includes('05551234567'), adminText);
  check('hizmet', adminText.includes('Manikür'), adminText);
  check('fiyat', adminText.includes('500 TL'), adminText);
  check('not', adminText.includes('İlk seansım'), adminText);
  eq('toplam kayıt istatistiği', await admin.locator('#stat-all').innerText(), '2');

  section('Sıralama ve filtreler');
  const times = await admin.locator('.appointment__when').allInnerTexts();
  check('tarih/saate göre sıralı',
    JSON.stringify(times) === JSON.stringify([...times].sort()), times.join(' | '));
  for (const [filter, title] of [
    ['today', 'Bugünkü Randevular'], ['tomorrow', 'Yarınki Randevular'],
    ['week', 'Bu Haftaki Randevular'], ['upcoming', 'Yaklaşan Randevular'],
    ['past', 'Geçmiş Randevular'], ['all', 'Tüm Randevular']
  ]) {
    await admin.click(`.filter[data-filter="${filter}"]`);
    check(`${filter} başlığı`,
      (await admin.locator('#list-title').innerText()).startsWith(title),
      await admin.locator('#list-title').innerText());
  }
  await admin.click('.filter[data-filter="past"]');
  eq('geçmiş randevu yok', await admin.locator('.empty').innerText(), 'Geçmiş randevu kaydı yok.');

  section('Arama');
  await admin.click('.filter[data-filter="all"]');
  await admin.fill('#search', 'Zeynep');
  eq('isimle arama', await admin.locator('.appointment').count(), 1);
  await admin.fill('#search', '05551234567');
  eq('telefonla arama', await admin.locator('.appointment').count(), 1);
  await admin.fill('#search', 'Manikür');
  eq('hizmetle arama', await admin.locator('.appointment').count(), 1);
  await admin.fill('#search', 'bulunamayacak-kayit');
  eq('sonuçsuz arama mesajı', await admin.locator('.empty').innerText(),
    'Aramanıza uygun randevu bulunamadı.');
  await admin.fill('#search', '');
  eq('arama temizlendi', await admin.locator('.appointment').count(), 2);

  section('Durum işaretleme');
  const firstCard = admin.locator('.appointment').first();
  await firstCard.locator('[data-action="status"][data-status="done"]').click();
  await admin.waitForSelector('.badge--done');
  eq('Geldi rozeti', await admin.locator('.badge--done').first().innerText(), 'GELDİ');
  let rows = await readStore(admin);
  eq('durum kaydedildi', rows.filter(r => r.status === 'done').length, 1);
  await admin.locator('.appointment').first()
    .locator('[data-action="status"][data-status="no-show"]').click();
  await admin.waitForSelector('.badge--no-show');
  rows = await readStore(admin);
  eq('durum değiştirildi', rows.filter(r => r.status === 'no-show').length, 1);
  await admin.locator('.appointment').first()
    .locator('[data-action="status"][data-status="no-show"]').click();
  await admin.waitForFunction(() => document.querySelectorAll('.badge--no-show').length === 0);
  rows = await readStore(admin);
  eq('durum kaldırıldı', rows.filter(r => r.status).length, 0);

  section('Telefonla gelen randevu ekleme');
  await admin.click('#toggle-create');
  eq('form açıldı', await admin.locator('#create-form').isVisible(), true);
  eq('buton metni', await admin.locator('#toggle-create').innerText(), 'Formu Kapat');

  await admin.locator('.mini-option', { hasText: 'Pedikür' }).click();
  eq('mini toplam', await admin.locator('#create-total').innerText(), '600 TL');
  eq('mini süre', await admin.locator('#create-duration').innerText(), '· yakl. 1 sa');

  await admin.click('#create-submit');
  eq('tarih/saat zorunlu', await admin.locator('#create-error').innerText(), 'Lütfen bir saat seçin.');

  /* Yarın için boş bir saat bul */
  const adminDate = await admin.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 2);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  });
  await admin.fill('#create-date', adminDate);
  await admin.dispatchEvent('#create-date', 'change');
  await admin.selectOption('#create-time', '11:00');
  await admin.click('#create-submit');
  eq('isim zorunlu', await admin.locator('#create-error').innerText(), 'Lütfen ad ve soyadınızı girin.');

  await admin.fill('#create-name', 'Fatma Demir');
  await admin.fill('#create-phone', '05551112233');
  await admin.fill('#create-note', 'Telefonla arandı');
  await admin.click('#create-submit');
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 3);
  eq('randevu eklendi', await admin.locator('.appointment').count(), 3);
  eq('form kapandı', await admin.locator('#create-form').isVisible(), false);
  rows = await readStore(admin);
  const manual = rows.filter(r => r.customerName === 'Fatma Demir')[0];
  eq('kaynak işaretlendi', manual.source, 'admin');
  eq('tarih doğru', manual.date, adminDate);
  eq('saat doğru', manual.time, '11:00');
  eq('toplam doğru', manual.total, 600);
  eq('not kaydedildi', manual.note, 'Telefonla arandı');
  eq('Telefonla rozeti', await admin.locator('.badge--manual').count(), 1);

  section('Panelde çakışma kontrolü');
  await admin.click('#toggle-create');
  await admin.locator('.mini-option', { hasText: 'Manikür' }).click();
  await admin.fill('#create-date', adminDate);
  await admin.dispatchEvent('#create-date', 'change');
  const busyOption = await admin.locator('#create-time option[value="11:00"]').isDisabled();
  eq('dolu saat seçenekte kapalı', busyOption, true);
  eq('dolu saat etiketli',
    (await admin.locator('#create-time option[value="11:00"]').innerText()).includes('dolu'), true);
  await admin.click('#create-cancel');
  eq('vazgeçince form kapanır', await admin.locator('#create-form').isVisible(), false);

  section('Yedekleme — JSON ve CSV');
  await admin.click('#backup summary');
  const jsonDownload = await Promise.all([
    admin.waitForEvent('download'), admin.click('#export-json')
  ]).then(([d]) => d);
  check('JSON dosya adı', /^melek-randevular-\d{4}-\d{2}-\d{2}\.json$/.test(jsonDownload.suggestedFilename()),
    jsonDownload.suggestedFilename());
  const jsonPath = path.join(os.tmpdir(), 'melek-backup.json');
  await jsonDownload.saveAs(jsonPath);
  const backup = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  eq('yedekte 3 randevu', backup.length, 3);

  const csvDownload = await Promise.all([
    admin.waitForEvent('download'), admin.click('#export-csv')
  ]).then(([d]) => d);
  check('CSV dosya adı', /\.csv$/.test(csvDownload.suggestedFilename()), csvDownload.suggestedFilename());
  const csvPath = path.join(os.tmpdir(), 'melek-backup.csv');
  await csvDownload.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('CSV BOM içerir (Excel Türkçe)', csv.charCodeAt(0) === 0xfeff, String(csv.charCodeAt(0)));
  check('CSV başlık satırı', csv.includes('"Tarih";"Saat";"Ad Soyad"'), csv.split('\r\n')[0]);
  check('CSV müşteri satırı', csv.includes('Fatma Demir'), csv);
  eq('CSV satır sayısı (başlık + 3)', csv.trim().split('\r\n').length, 4);
  fs.unlinkSync(csvPath);

  section('Yedekten geri yükleme');
  await seedStore(admin, []);
  await admin.evaluate(() => window.MelekAdmin.reload());
  await admin.waitForSelector('.empty');
  eq('kayıtlar silindi', await admin.locator('.appointment').count(), 0);
  admin.once('dialog', (d) => d.accept());
  await admin.setInputFiles('#import-file', jsonPath);
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 3);
  eq('yedek geri yüklendi', await admin.locator('.appointment').count(), 3);
  rows = await readStore(admin);
  eq('localStorage geri yüklendi', rows.length, 3);
  fs.unlinkSync(jsonPath);

  section('TEST 11 — Silme, iptal ve localStorage senkronu');
  admin.once('dialog', (d) => d.dismiss());
  await admin.locator('[data-action="delete"]').first().click();
  await admin.waitForTimeout(150);
  eq('iptal edilince silinmez', await admin.locator('.appointment').count(), 3);

  admin.once('dialog', (d) => d.accept());
  await admin.locator('[data-action="delete"]').first().click();
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 2);
  eq('onaylanınca silinir', await admin.locator('.appointment').count(), 2);
  rows = await readStore(admin);
  eq('localStorage\'dan da silindi', rows.length, 2);

  /* Müşteri tarafı silinen saati yeniden açmalı */
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clickService(page, 'Manikür');
  await page.click('#btn-next');
  await page.locator(`.day[data-date="${firstDate}"]`).click();
  eq('silinen saat tekrar açıldı',
    await page.locator(`.slot[data-time="${firstTime}"]`).isDisabled(), false);
  eq('duran randevunun saati dolu',
    await page.locator(`.slot[data-time="${secondTime}"]`).isDisabled(), true);

  section('Oturum ve çıkış');
  await admin.reload();
  await admin.waitForSelector('#panel:not([hidden])');
  eq('oturum korunur', await admin.locator('#panel').isVisible(), true);
  await admin.click('#logout');
  await admin.waitForSelector('#gate:not([hidden])');
  eq('çıkış sonrası giriş ekranı', await admin.locator('#gate').isVisible(), true);
  await admin.reload();
  await admin.waitForSelector('#gate:not([hidden])');
  eq('çıkış kalıcı', await admin.locator('#panel').isVisible(), false);

  /* ==================== ERİŞİLEBİLİRLİK ==================== */

  section('Erişilebilirlik');
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  eq('telefon linki', await page.locator('header .phone').getAttribute('href'), 'tel:+905551918058');
  eq('telefon metni', (await page.locator('header .phone span').innerText()).trim(), '0555 191 8058');
  eq('footer telefonu da bağlı',
    await page.locator('footer [data-phone]').getAttribute('href'), 'tel:+905551918058');
  /* config.js'i sunucu seviyesinde değiştirerek gerçek davranışı sınıyoruz */
  await page.route('**/js/config.js', async (route) => {
    const original = await route.fetch();
    const body = (await original.text())
      .replace("'0555 191 8058'", "'0532 000 0000'")
      .replace("'tel:+905551918058'", "'tel:+905320000000'");
    await route.fulfill({ response: original, body, headers: { 'content-type': 'application/javascript' } });
  });
  await page.reload();
  await page.waitForSelector('.option');
  eq('ayardaki numara linke yansır',
    await page.locator('header .phone').getAttribute('href'), 'tel:+905320000000');
  eq('ayardaki numara metne yansır',
    (await page.locator('header .phone [data-phone-text]').innerText()).trim(), '0532 000 0000');
  eq('footer de ayardan beslenir',
    await page.locator('footer [data-phone]').getAttribute('href'), 'tel:+905320000000');
  await page.unroute('**/js/config.js');
  await page.reload();
  await page.waitForSelector('.option');
  eq('varsayılan ayara dönüldü',
    await page.locator('header .phone').getAttribute('href'), 'tel:+905551918058');

  eq('div-click yok',
    await page.evaluate(() =>
      document.querySelectorAll('.option:not(button), .day:not(button), .slot:not(button), .chip:not(button)').length), 0);
  eq('tüm form alanları etiketli',
    await page.evaluate(() => {
      const fields = document.querySelectorAll('input, select');
      return Array.prototype.filter.call(fields, (f) =>
        f.type !== 'hidden' && !document.querySelector(`label[for="${f.id}"]`) &&
        !f.getAttribute('aria-label')).length;
    }), 0);
  eq('tek h1', await page.locator('h1').count(), 1);

  await page.locator('.option').first().focus();
  await page.keyboard.press('Enter');
  eq('klavye ile seçim', await total(page), '400 TL');
  await page.keyboard.press('Space');
  eq('klavye ile kaldırma', await total(page), '0 TL');

  /* ==================== RESPONSIVE ==================== */

  section('Responsive (375 / 390 / 768 / 1440)');
  await clickService(page, 'Manikür');
  for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(width + 'px yatay taşma yok', overflow <= 0, 'taşma: ' + overflow + 'px');
  }
  await openAdmin(admin);
  for (const width of [375, 768, 1440]) {
    await admin.setViewportSize({ width, height: 900 });
    await admin.waitForTimeout(80);
    const overflow = await admin.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('admin ' + width + 'px taşma yok', overflow <= 0, 'taşma: ' + overflow + 'px');
  }

  /* ==================== DAYANIKLILIK ==================== */

  section('Bozuk localStorage verisine dayanıklılık');
  await page.evaluate(() => localStorage.setItem('melekAppointments', '{bozuk-json'));
  const beforeCorrupt = consoleErrors.length;
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clickService(page, 'Pedikür');
  await page.click('#btn-next');
  eq('bozuk veriyle adım 2 açılır', await visibleStep(page), 2);
  await page.locator('.day').nth(1).click();
  eq('bozuk veriyle saatler gelir', await page.locator('.slot').count(), 16);
  eq('console error üretmez', consoleErrors.length, beforeCorrupt);

  await page.evaluate(() => localStorage.setItem('melekAppointments', '{bozuk-json'));
  await openAdmin(admin);
  await admin.click('.filter[data-filter="all"]');
  await admin.waitForSelector('.empty');
  eq('admin bozuk veriyle boş liste',
    await admin.locator('.empty').innerText(), 'Henüz randevu kaydı yok.');

  await clearStore(page);
  await browser.close();

  /* ------------------------------- sonuç -------------------------------- */
  console.log('\n================ SONUÇ ================');
  console.log(`Geçen: ${passed}   Başarısız: ${failed}`);
  if (consoleErrors.length) {
    console.log(`\nConsole hataları (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log('  - ' + e));
  } else {
    console.log('Console hatası: yok');
  }
  process.exit(failed || consoleErrors.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
