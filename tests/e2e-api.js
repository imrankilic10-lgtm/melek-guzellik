/*
 * tests/e2e-api.js — Ön yüzün backend ile birlikte çalışması (API modu).
 * Sunucuyu geçici bir veritabanıyla kendi içinde başlatır.
 *
 * Çalıştırma:  node tests/e2e-api.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'melek-e2e-api-')), 'db.sqlite');
const PORT = 3202;
const PASSWORD = 'panel-sifresi-456';

process.env.PORT = String(PORT);
process.env.MELEK_DB = TEST_DB;
process.env.MELEK_ADMIN_PASSWORD = PASSWORD;

const server = require('../server/server.js');
const db = require('../server/db.js');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:' + PORT;
let passed = 0, failed = 0;
const consoleErrors = [];

/* Tarayıcının HTTP 4xx ağ günlükleri uygulama hatası değildir */
const NETWORK_LOG = /Failed to load resource/i;

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
    if (m.type() === 'error' && !NETWORK_LOG.test(m.text())) {
      consoleErrors.push(tag + ' :: ' + m.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(tag + ' :: pageerror: ' + e.message));
}

const clickService = (page, name) =>
  page.locator('.option__name', { hasText: new RegExp('^' + name + '$') }).first().click();

async function visibleStep(page) {
  for (const n of [1, 2, 3, 4]) {
    if (await page.locator('#step-' + n).isVisible()) return n;
  }
  return 0;
}

async function adminLogin(page, passcode) {
  await page.fill('#gate-passcode', passcode === undefined ? PASSWORD : passcode);
  await page.click('#gate-form button[type="submit"]');
}

(async () => {
  await new Promise((resolve) => { server.server.listen(PORT, '127.0.0.1', resolve); });
  db.open();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 880 } });
  const page = await context.newPage();
  watch(page, 'musteri');

  /* ========================= MOD TESPİTİ ========================== */

  section('Mod tespiti');
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await page.waitForFunction(() => window.MelekStore.getMode() === 'api');
  eq('API modu algılandı', await page.evaluate(() => window.MelekStore.getMode()), 'api');

  /* ====================== MÜŞTERİ AKIŞI ========================== */

  section('Randevu oluşturma');
  await clickService(page, 'Manikür');
  eq('toplam', await page.locator('#total-price').innerText(), '500 TL');
  await page.click('#btn-next');
  await page.waitForSelector('.day');
  await page.locator('.day:not([disabled])').nth(1).click();
  await page.waitForSelector('.slot');
  eq('saatler sunucudan geldi', await page.locator('.slot').count(), 16);

  const chosenDate = await page.locator('.day[aria-pressed="true"]').getAttribute('data-date');
  const slot = page.locator('.slot:not([disabled])').first();
  const chosenTime = await slot.innerText();
  await slot.click();
  await page.click('#btn-next');
  await page.waitForSelector('#step-3:not([hidden])');
  eq('adım 3 açıldı', await visibleStep(page), 3);

  await page.fill('#customer-name', 'Ayşe Yılmaz');
  await page.fill('#customer-phone', '0555 123 4567');
  await page.fill('#customer-note', 'İlk seansım');
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  eq('onay ekranı', await visibleStep(page), 4);
  const confirmText = await page.locator('#confirm-summary').innerText();
  check('onayda hizmet', confirmText.includes('Manikür'), confirmText);
  check('onayda toplam', confirmText.includes('500 TL'), confirmText);

  section('Veri sunucuda, tarayıcıda değil');
  eq('localStorage kullanılmadı',
    await page.evaluate(() => localStorage.getItem('melekAppointments')), null);
  const inDb = db.get().prepare('SELECT * FROM appointments').all();
  eq('veritabanında 1 kayıt', inDb.length, 1);
  eq('veritabanındaki isim', inDb[0].customer_name, 'Ayşe Yılmaz');
  eq('veritabanındaki tutar', inDb[0].total, 500);
  eq('veritabanındaki not', inDb[0].note, 'İlk seansım');

  section('Cihazlar arası paylaşım');
  const other = await context.newPage();
  watch(other, 'musteri-2');
  await other.goto(BASE + '/index.html');
  await other.waitForSelector('.option');
  await clickService(other, 'Pedikür');
  await other.click('#btn-next');
  await other.locator(`.day[data-date="${chosenDate}"]`).click();
  await other.waitForSelector('.slot');
  const busySlot = other.locator(`.slot[data-time="${chosenTime}"]`);
  eq('başka tarayıcıda dolu görünür', await busySlot.isDisabled(), true);
  eq('dolu etiketi', await busySlot.getAttribute('aria-label'), chosenTime + ' — dolu');

  section('Sunucu çakışmayı son anda da yakalar');
  /* İkinci sekme boş bir saat seçsin, sonra o saati doğrudan API ile doldur */
  const freeSlot = other.locator('.slot:not([disabled])').first();
  const raceTime = await freeSlot.innerText();
  await freeSlot.click();
  await fetch(BASE + '/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceIds: ['kas-biyik'], date: chosenDate, time: raceTime,
      customerName: 'Araya Giren', phone: '05550000000'
    })
  });
  await other.click('#btn-next');
  await other.waitForSelector('#notice:not([hidden])');
  eq('çakışma uyarısı gösterildi', await other.locator('#notice').innerText(),
    'Bu saat için başka bir randevu bulunuyor. Lütfen farklı bir saat seçin.');
  eq('saat adımında kalır', await visibleStep(other), 2);

  /* ======================= YÖNETİCİ PANELİ ======================== */

  section('Panel girişi sunucu şifresiyle');
  const admin = await context.newPage();
  watch(admin, 'admin');
  await admin.goto(BASE + '/admin/index.html');
  await admin.waitForSelector('#gate:not([hidden])');
  eq('giriş ekranı', await admin.locator('#gate').isVisible(), true);

  /* js/config.js içindeki yerel şifre API modunda geçerli olmamalı */
  await adminLogin(admin, 'melek2026');
  await admin.waitForSelector('#gate-error:not([hidden])');
  eq('yerel şifre kabul edilmez', await admin.locator('#panel').isVisible(), false);

  await adminLogin(admin, PASSWORD);
  await admin.waitForSelector('#panel:not([hidden])');
  eq('sunucu şifresiyle giriş', await admin.locator('#panel').isVisible(), true);

  section('Panel verisi sunucudan');
  await admin.click('.filter[data-filter="all"]');
  await admin.waitForSelector('.appointment');
  eq('2 randevu listelenir', await admin.locator('.appointment').count(), 2);
  const adminText = await admin.locator('#appointment-list').innerText();
  check('müşteri adı', adminText.includes('Ayşe Yılmaz'), adminText);
  check('telefon', adminText.includes('05551234567'), adminText);
  check('not', adminText.includes('İlk seansım'), adminText);
  eq('istatistik sunucudan', await admin.locator('#stat-all').innerText(), '2');

  section('Panelden randevu ekleme');
  await admin.click('#toggle-create');
  await admin.locator('.mini-option', { hasText: 'Kirpik Lifting' }).click();
  eq('mini toplam', await admin.locator('#create-total').innerText(), '800 TL');

  const adminDate = await admin.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  });
  await admin.fill('#create-date', adminDate);
  await admin.dispatchEvent('#create-date', 'change');
  await admin.waitForFunction(() =>
    document.querySelectorAll('#create-time option').length > 2);
  await admin.selectOption('#create-time', '13:00');
  await admin.fill('#create-name', 'Fatma Demir');
  await admin.fill('#create-phone', '05551112233');
  await admin.fill('#create-note', 'Telefonla arandı');
  await admin.click('#create-submit');
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 3);
  eq('randevu eklendi', await admin.locator('.appointment').count(), 3);

  const manual = db.get()
    .prepare('SELECT * FROM appointments WHERE customer_name = ?').get('Fatma Demir');
  eq('veritabanına yazıldı', manual.time, '13:00');
  eq('kaynak admin', manual.source, 'admin');
  eq('tutar sunucudan', manual.total, 800);

  section('Durum ve silme sunucuya işlenir');
  await admin.locator('.appointment').first()
    .locator('[data-action="status"][data-status="done"]').click();
  await admin.waitForSelector('.badge--done');
  eq('durum veritabanında',
    db.get().prepare('SELECT COUNT(*) AS c FROM appointments WHERE status = ?').get('done').c, 1);

  admin.once('dialog', (d) => d.accept());
  await admin.locator('[data-action="delete"]').first().click();
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 2);
  eq('veritabanından silindi',
    db.get().prepare('SELECT COUNT(*) AS c FROM appointments').get().c, 2);

  section('Yedekleme ve geri yükleme');
  await admin.click('#backup summary');
  const download = await Promise.all([
    admin.waitForEvent('download'), admin.click('#export-json')
  ]).then(([d]) => d);
  const backupPath = path.join(os.tmpdir(), 'melek-api-backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  eq('yedekte 2 kayıt', backup.length, 2);

  admin.once('dialog', (d) => d.accept());
  await admin.setInputFiles('#import-file', backupPath);
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 2);
  eq('geri yükleme sonrası veritabanı',
    db.get().prepare('SELECT COUNT(*) AS c FROM appointments').get().c, 2);
  fs.unlinkSync(backupPath);
  check('yedekleme notu API moduna göre',
    (await admin.locator('.backup__text').innerText()).includes('sunucudaki veritabanında'),
    await admin.locator('.backup__text').innerText());

  section('Oturum sunucu tarafında');
  await admin.reload();
  await admin.waitForSelector('#panel:not([hidden])');
  eq('yenilemede oturum sürer', await admin.locator('#panel').isVisible(), true);

  await admin.click('#logout');
  await admin.waitForSelector('#gate:not([hidden])');
  eq('çıkış sonrası giriş ekranı', await admin.locator('#gate').isVisible(), true);
  const afterLogout = await admin.evaluate(() =>
    fetch('/api/admin/appointments', { credentials: 'same-origin' }).then((r) => r.status));
  eq('oturum sunucuda da kapandı', afterLogout, 401);

  section('Veri kalıcılığı');
  const fresh = await browser.newContext({ viewport: { width: 390, height: 880 } });
  const freshPage = await fresh.newPage();
  watch(freshPage, 'temiz-oturum');
  await freshPage.goto(BASE + '/admin/index.html');
  await freshPage.waitForSelector('#gate:not([hidden])');
  eq('yeni tarayıcı giriş ister', await freshPage.locator('#gate').isVisible(), true);
  await freshPage.fill('#gate-passcode', PASSWORD);
  await freshPage.click('#gate-form button[type="submit"]');
  await freshPage.waitForSelector('#panel:not([hidden])');
  await freshPage.click('.filter[data-filter="all"]');
  await freshPage.waitForSelector('.appointment');
  eq('kayıtlar yeni tarayıcıda da görünür',
    await freshPage.locator('.appointment').count(), 2);

  await browser.close();
  await server.stop();
  fs.rmSync(path.dirname(TEST_DB), { recursive: true, force: true });

  console.log('\n================ SONUÇ ================');
  console.log(`Geçen: ${passed}   Başarısız: ${failed}`);
  if (consoleErrors.length) {
    console.log(`\nConsole hataları (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log('  - ' + e));
  } else {
    console.log('Console hatası: yok');
  }
  process.exit(failed || consoleErrors.length ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  try { await server.stop(); } catch (e) { /* yoksayılır */ }
  process.exit(1);
});
