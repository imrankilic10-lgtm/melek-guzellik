/*
 * tests/e2e.js — Uçtan uca tarayıcı testleri (Playwright + Chromium).
 * Çalıştırma:  npx http-server -p 8123 .   ardından   node tests/e2e.js
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
let passed = 0, failed = 0;
const consoleErrors = [];

function check(label, ok, detail) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}
function eq(label, got, want) {
  check(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
function section(name) { console.log('\n' + name); }

const watch = (page) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(page.url() + ' :: ' + msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(page.url() + ' :: pageerror: ' + err.message));
};

/* ---------------- yardımcılar ---------------- */

const selectService = (page, name) =>
  page.locator('.option', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      .filter({ has: page.locator('.option__name', { hasText: name }) }).first();

async function clickService(page, name) {
  await page.locator('.option__name', { hasText: new RegExp('^' + name + '$') }).first().click();
}
const total = (page) => page.locator('#total-price').innerText();
const notice = async (page) => (await page.locator('#notice').isVisible()) ? (await page.locator('#notice').innerText()) : '';
const visibleStep = async (page) => {
  for (const n of [1, 2, 3, 4]) {
    if (await page.locator('#step-' + n).isVisible()) return n;
  }
  return 0;
};
async function pickFirstAvailableDay(page, index = 0) {
  await page.locator('.day').nth(index).click();
}
async function pickFirstOpenSlot(page) {
  const slot = page.locator('.slot:not([disabled])').first();
  const time = await slot.innerText();
  await slot.click();
  return time;
}
const clearStore = (page) => page.evaluate(() => localStorage.removeItem('melekAppointments'));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  watch(page);

  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clearStore(page);
  await page.reload();
  await page.waitForSelector('.option');

  /* ---------------- TEST 6 (önce, temiz durumda) ---------------- */
  section('EK — Adım 1 arayüz durumu');
  eq('adım 1\'de Geri butonu gizli', await page.locator('#btn-back').isVisible(), false);
  eq('adım 1 buton metni', await page.locator('#btn-next').innerText(), 'Tarih ve Saat Seç');

  section('TEST 6 — Hizmet seçmeden devam engellenmeli');
  await page.click('#btn-next');
  eq('uyarı mesajı', await notice(page), 'Lütfen önce bir hizmet seçin.');
  eq('adım 1\'de kalır', await visibleStep(page), 1);

  /* ---------------- TEST 2 / 3 / 4 / 5 — lazer fiyatları ---------------- */
  section('TEST 2 — Tüm Yüz + Çene + Bıyık = 600 TL');
  for (const s of ['Tüm Yüz', 'Çene', 'Bıyık']) await clickService(page, s);
  eq('toplam', await total(page), '600 TL');
  eq('3 kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 3);

  section('TEST 3 — Tüm Kol + Tüm Bacak + Sırt = 1400 TL');
  for (const s of ['Tüm Yüz', 'Çene', 'Bıyık']) await clickService(page, s);   // seçimi temizle
  eq('temizlendi', await total(page), '0 TL');
  for (const s of ['Tüm Kol', 'Tüm Bacak', 'Sırt']) await clickService(page, s);
  eq('toplam', await total(page), '1400 TL');

  section('TEST 4 — Tüm Vücut seçilince diğer lazer seçimleri kalkar');
  await clickService(page, 'Tüm Vücut Tek Seans');
  eq('toplam', await total(page), '1500 TL');
  eq('yalnız 1 kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 1);
  eq('seçili olan Tüm Vücut',
    await page.locator('.option[aria-pressed="true"] .option__name').innerText(), 'Tüm Vücut Tek Seans');

  section('TEST 5 — Tüm Vücut seçiliyken Çene seçilirse Tüm Vücut kalkar');
  await clickService(page, 'Çene');
  eq('toplam 100 TL', await total(page), '100 TL');
  eq('yalnız 1 kart seçili', await page.locator('.option[aria-pressed="true"]').count(), 1);
  eq('seçili olan Çene',
    await page.locator('.option[aria-pressed="true"] .option__name').innerText(), 'Çene');

  section('EK — Kategori içi tek seçim ve kategoriler arası toplam');
  await clickService(page, 'Çene');                       // temizle
  await clickService(page, 'Manikür');
  await clickService(page, 'Pedikür');
  eq('El & Ayak tek seçim → 600 TL', await total(page), '600 TL');
  await clickService(page, 'Pedikür');                    // temizle

  /* ---------------- TEST 1 — Manikür ile tam akış ---------------- */
  section('TEST 1 — Manikür 500 TL ile uçtan uca randevu');
  await clickService(page, 'Manikür');
  eq('toplam', await total(page), '500 TL');
  await page.click('#btn-next');
  eq('adım 2 açıldı', await visibleStep(page), 2);
  eq('adım 2\'de Geri butonu görünür', await page.locator('#btn-back').isVisible(), true);
  eq('adım 2 buton metni', await page.locator('#btn-next').innerText(), 'Bilgilerime Geç');
  await page.click('#btn-back');
  eq('Geri adım 1\'e döner', await visibleStep(page), 1);
  eq('geri dönünce seçim korunur', await total(page), '500 TL');
  await page.click('#btn-next');

  /* ---------------- TEST 7 — tarih seçmeden saat ---------------- */
  section('TEST 7 — Tarih seçmeden saat seçilemez');
  eq('saat kartı yok', await page.locator('.slot').count(), 0);
  eq('ipucu görünür', await page.locator('#time-hint').innerText(), 'Saatleri görmek için önce bir tarih seçin.');

  /* ---------------- TEST 8 — saat seçmeden devam ---------------- */
  section('TEST 8 — Saat seçmeden devam engellenmeli');
  await page.click('#btn-next');
  eq('tarih uyarısı', await notice(page), 'Lütfen bir tarih seçin.');
  await pickFirstAvailableDay(page, 1);                   // yarın
  check('saat kartları geldi', (await page.locator('.slot').count()) === 16);
  await page.click('#btn-next');
  eq('saat uyarısı', await notice(page), 'Lütfen bir saat seçin.');
  eq('adım 2\'de kalır', await visibleStep(page), 2);

  /* ---------------- akışa devam ---------------- */
  const chosenDate = await page.locator('.day[aria-pressed="true"]').getAttribute('data-date');
  const chosenTime = await pickFirstOpenSlot(page);
  await page.click('#btn-next');
  eq('adım 3 açıldı', await visibleStep(page), 3);

  eq('adım 3\'te aksiyon çubuğu gizli', await page.locator('#actionbar').isVisible(), false);

  const summaryText = await page.locator('#summary').innerText();
  check('özet hizmeti gösterir', summaryText.includes('Manikür'), summaryText);
  check('özet saati gösterir', summaryText.includes(chosenTime), summaryText);
  check('özet toplamı gösterir', summaryText.includes('500 TL'), summaryText);

  section('EK — Boş form doğrulaması');
  await page.click('#submit-appointment');
  eq('ad soyad uyarısı', await notice(page), 'Lütfen ad ve soyadınızı girin.');
  eq('adım 3\'te kalır', await visibleStep(page), 3);
  await page.fill('#customer-name', 'Ayşe Yılmaz');
  await page.click('#submit-appointment');
  eq('telefon uyarısı', await notice(page), 'Lütfen telefon numaranızı girin.');
  await page.fill('#customer-phone', '555');
  await page.click('#submit-appointment');
  eq('kısa telefon uyarısı', await notice(page), 'Telefon numarası en az 10 haneli olmalıdır.');
  eq('telefon input tipi', await page.locator('#customer-phone').getAttribute('type'), 'tel');
  eq('telefon inputmode', await page.locator('#customer-phone').getAttribute('inputmode'), 'tel');

  const urlBefore = page.url();
  await page.fill('#customer-phone', '0555 123 4567');
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  eq('adım 4 açıldı', await visibleStep(page), 4);
  eq('form submit sayfayı yenilemedi', page.url(), urlBefore);
  eq('onay başlığı', await page.locator('#step-4-title').innerText(), 'Randevunuz oluşturuldu.');
  eq('adım 4\'te aksiyon çubuğu gizli', await page.locator('#actionbar').isVisible(), false);
  const confirmText = await page.locator('#confirm-summary').innerText();
  check('onayda hizmet', confirmText.includes('Manikür'), confirmText);
  check('onayda toplam', confirmText.includes('500 TL'), confirmText);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('melekAppointments') || '[]'));
  eq('localStorage kayıt sayısı', stored.length, 1);
  eq('kayıtlı müşteri', stored[0].customerName, 'Ayşe Yılmaz');
  eq('kayıtlı telefon', stored[0].phone, '05551234567');
  eq('kayıtlı toplam', stored[0].total, 500);
  eq('kayıtlı süre', stored[0].duration, 45);
  eq('kayıtlı tarih', stored[0].date, chosenDate);
  eq('kayıtlı saat', stored[0].time, chosenTime);

  /* ---------------- TEST 9 — çakışma ---------------- */
  section('TEST 9 — Aynı tarih + saate ikinci randevu engellenmeli');
  await page.click('#new-appointment');
  eq('adım 1\'e döndü', await visibleStep(page), 1);
  eq('toplam sıfırlandı', await total(page), '0 TL');
  eq('seçimler temizlendi', await page.locator('.option[aria-pressed="true"]').count(), 0);

  await clickService(page, 'Kirpik Lifting');
  await page.click('#btn-next');
  await page.locator(`.day[data-date="${chosenDate}"]`).click();
  const busySlot = page.locator(`.slot[data-time="${chosenTime}"]`);
  eq('dolu saat devre dışı', await busySlot.isDisabled(), true);
  eq('dolu saat etiketi', await busySlot.getAttribute('aria-label'), chosenTime + ' — dolu');
  await busySlot.click({ force: true });
  eq('dolu saat seçilemez', await busySlot.getAttribute('aria-pressed'), 'false');

  /* Depoyu doğrudan zorlayarak sunucu tarafı kontrolü de sınayalım */
  const secondTime = await pickFirstOpenSlot(page);
  await page.evaluate(({ d, t }) => {
    const rows = JSON.parse(localStorage.getItem('melekAppointments') || '[]');
    rows.push({ id: 'race', date: d, time: t, duration: 60, total: 800,
                customerName: 'Test', phone: '05550000000', serviceLabel: 'Kirpik Lifting', regions: [] });
    localStorage.setItem('melekAppointments', JSON.stringify(rows));
  }, { d: chosenDate, t: secondTime });
  await page.click('#btn-next');
  eq('çakışma uyarısı', await notice(page), 'Bu saat için başka bir randevu bulunuyor. Lütfen farklı bir saat seçin.');
  eq('adım 2\'de kalır', await visibleStep(page), 2);

  /* yarış kaydını temizle, akışı bitir */
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('melekAppointments') || '[]').filter(r => r.id !== 'race');
    localStorage.setItem('melekAppointments', JSON.stringify(rows));
  });
  await page.locator(`.day[data-date="${chosenDate}"]`).click();
  const thirdTime = await pickFirstOpenSlot(page);
  await page.click('#btn-next');
  await page.fill('#customer-name', 'Zeynep Kaya');
  await page.fill('#customer-phone', '05559998877');
  await page.click('#submit-appointment');
  await page.waitForSelector('#step-4:not([hidden])');
  const stored2 = await page.evaluate(() => JSON.parse(localStorage.getItem('melekAppointments') || '[]'));
  eq('ikinci randevu kaydedildi', stored2.length, 2);

  /* ---------------- TEST 12 — yenileme sonrası hata yok ---------------- */
  section('TEST 12 — Sayfa yenilendiğinde JavaScript hatası olmamalı');
  const before = consoleErrors.length;
  await page.reload();
  await page.waitForSelector('.option');
  await page.click('#btn-next');                       // seçimsiz: uyarı vermeli
  eq('yenileme sonrası uyarı çalışıyor', await notice(page), 'Lütfen önce bir hizmet seçin.');
  eq('yenilemede yeni console hatası yok', consoleErrors.length, before);

  /* ---------------- TEST 10 / 11 — admin ---------------- */
  section('TEST 10 — Randevular admin panelinde görünmeli');
  const admin = await context.newPage();
  watch(admin);
  await admin.goto(BASE + '/admin/index.html');
  await admin.waitForSelector('.filter');
  await admin.click('.filter[data-filter="all"]');
  await admin.waitForSelector('.appointment');
  eq('admin 2 randevu listeler', await admin.locator('.appointment').count(), 2);
  const adminText = await admin.locator('#appointment-list').innerText();
  check('müşteri adı görünür', adminText.includes('Ayşe Yılmaz'), adminText);
  check('telefon görünür', adminText.includes('05551234567'), adminText);
  check('hizmet görünür', adminText.includes('Manikür'), adminText);
  check('fiyat görünür', adminText.includes('500 TL'), adminText);
  eq('toplam kayıt istatistiği', await admin.locator('#stat-all').innerText(), '2');

  section('EK — Admin sıralama ve filtreler');
  const times = await admin.locator('.appointment__when').allInnerTexts();
  const sorted = [...times].sort();
  check('tarih/saate göre sıralı', JSON.stringify(times) === JSON.stringify(sorted), times.join(' | '));
  await admin.click('.filter[data-filter="today"]');
  eq('bugün başlığı', await admin.locator('#list-title').innerText(), 'Bugünkü Randevular');
  await admin.click('.filter[data-filter="tomorrow"]');
  eq('yarın başlığı', await admin.locator('#list-title').innerText(), 'Yarınki Randevular');
  eq('yarın 2 randevu', await admin.locator('.appointment').count(), 2);
  await admin.click('.filter[data-filter="upcoming"]');
  eq('yaklaşan başlığı', await admin.locator('#list-title').innerText(), 'Yaklaşan Randevular');

  section('TEST 11 — Admin silme, iptal ve localStorage senkronu');
  await admin.click('.filter[data-filter="all"]');
  admin.once('dialog', (d) => d.dismiss());
  await admin.locator('[data-action="delete"]').first().click();
  eq('iptal edilince silinmez', await admin.locator('.appointment').count(), 2);

  admin.once('dialog', (d) => d.accept());
  await admin.locator('[data-action="delete"]').first().click();
  await admin.waitForFunction(() => document.querySelectorAll('.appointment').length === 1);
  eq('onaylanınca silinir', await admin.locator('.appointment').count(), 1);
  const afterDelete = await admin.evaluate(() => JSON.parse(localStorage.getItem('melekAppointments') || '[]'));
  eq('localStorage\'dan da silindi', afterDelete.length, 1);
  eq('kalan kayıt doğru', afterDelete[0].customerName, 'Zeynep Kaya');

  /* Müşteri tarafı silinen saati yeniden açmalı */
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clickService(page, 'Manikür');
  await page.click('#btn-next');
  await page.locator(`.day[data-date="${chosenDate}"]`).click();
  eq('silinen saat tekrar açıldı',
    await page.locator(`.slot[data-time="${chosenTime}"]`).isDisabled(), false);
  eq('duran randevunun saati hâlâ dolu',
    await page.locator(`.slot[data-time="${thirdTime}"]`).isDisabled(), true);

  section('EK — Boş liste durumu');
  admin.once('dialog', (d) => d.accept());
  await admin.locator('[data-action="delete"]').first().click();
  await admin.waitForSelector('.empty');
  eq('boş mesajı', await admin.locator('.empty').innerText(), 'Henüz randevu kaydı yok.');

  /* ---------------- Erişilebilirlik / responsive ---------------- */
  section('EK — Erişilebilirlik ve telefon bağlantısı');
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  eq('telefon linki', await page.locator('header .phone').getAttribute('href'), 'tel:+905551918058');
  eq('telefon metni', (await page.locator('header .phone span').innerText()).trim(), '0555 191 8058');
  eq('div-click yok (tüm seçimler <button>)',
    await page.evaluate(() => document.querySelectorAll('.option:not(button), .day:not(button), .slot:not(button)').length), 0);
  eq('ad soyad label bağlı',
    await page.evaluate(() => document.querySelector('label[for="customer-name"]') !== null), true);
  eq('telefon label bağlı',
    await page.evaluate(() => document.querySelector('label[for="customer-phone"]') !== null), true);

  /* klavye ile seçim */
  await page.locator('.option').first().focus();
  await page.keyboard.press('Enter');
  eq('klavye ile hizmet seçimi', await total(page), '400 TL');
  await page.keyboard.press('Space');
  eq('klavye ile seçim kaldırma', await total(page), '0 TL');

  section('EK — Responsive (375 / 390 / 768 / 1440)');
  await clickService(page, 'Manikür');
  for (const width of [375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(width + 'px yatay taşma yok', overflow <= 0, 'taşma: ' + overflow + 'px');
    const barVisible = await page.locator('#actionbar').isVisible();
    check(width + 'px aksiyon çubuğu görünür', barVisible);
  }
  await admin.setViewportSize({ width: 375, height: 800 });
  await admin.waitForTimeout(80);
  const adminOverflow = await admin.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('admin 375px taşma yok', adminOverflow <= 0, 'taşma: ' + adminOverflow + 'px');

  section('EK — Bozuk localStorage verisine dayanıklılık');
  await page.evaluate(() => localStorage.setItem('melekAppointments', '{bozuk-json'));
  const beforeCorrupt = consoleErrors.length;
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.option');
  await clickService(page, 'Pedikür');
  await page.click('#btn-next');
  eq('bozuk veriyle adım 2 açılır', await visibleStep(page), 2);
  await pickFirstAvailableDay(page, 1);
  check('bozuk veriyle saatler gelir', (await page.locator('.slot').count()) === 16);
  eq('bozuk veri console error üretmez', consoleErrors.length, beforeCorrupt);

  await page.goto(BASE + '/admin/index.html');
  await page.waitForSelector('.filter');
  await page.click('.filter[data-filter="all"]');
  await page.waitForSelector('.empty');
  eq('admin bozuk veriyle boş liste gösterir',
    await page.locator('.empty').innerText(), 'Henüz randevu kaydı yok.');

  await clearStore(page);
  await browser.close();

  /* ---------------- sonuç ---------------- */
  console.log('\n================ SONUÇ ================');
  console.log('Geçen: ' + passed + '   Başarısız: ' + failed);
  if (consoleErrors.length) {
    console.log('\nConsole hataları (' + consoleErrors.length + '):');
    consoleErrors.forEach((e) => console.log('  - ' + e));
  } else {
    console.log('Console hatası: yok');
  }
  process.exit(failed || consoleErrors.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
