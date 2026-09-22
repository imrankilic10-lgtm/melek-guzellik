/*
 * tests/logic.js — Saf iş mantığı testleri (tarayıcı gerekmez).
 * Çalıştırma:  node tests/logic.js
 */
const path = require('path');
const Config = require(path.join(__dirname, '..', 'js', 'config.js'));
const B = require(path.join(__dirname, '..', 'js', 'booking.js'));

let passed = 0, failed = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + label +
    (ok ? '' : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`));
}
function section(name) { console.log('\n' + name); }

/* ----------------------------- fiyatlandırma ---------------------------- */
section('Fiyat hesaplama');
let s = B.createState();
B.toggleService(s, 'manikur');
eq('Manikür = 500 TL', B.getTotal(s), 500);

s = B.createState();
['lazer-tum-yuz', 'lazer-cene', 'lazer-biyik'].forEach(id => B.toggleService(s, id));
eq('Tüm Yüz + Çene + Bıyık = 600 TL', B.getTotal(s), 600);
eq('toplam süre 60 dk', B.getDuration(s), 60);

s = B.createState();
['lazer-tum-kol', 'lazer-tum-bacak', 'lazer-sirt'].forEach(id => B.toggleService(s, id));
eq('Tüm Kol + Tüm Bacak + Sırt = 1400 TL', B.getTotal(s), 1400);

s = B.createState();
['lazer-tum-yuz', 'lazer-cene', 'lazer-koltuk-alti'].forEach(id => B.toggleService(s, id));
eq('Şartname örneği = 800 TL', B.getTotal(s), 800);

/* Katalogdaki her fiyat ve sürenin tanımlı olduğunu doğrula */
const Data = require(path.join(__dirname, '..', 'js', 'data.js'));
const allServices = Data.CATEGORIES.reduce((acc, c) => acc.concat(c.services), []);
eq('21 hizmet tanımlı', allServices.length, 21);
eq('fiyatı eksik hizmet yok',
  allServices.filter(x => typeof x.price !== 'number' || x.price <= 0).length, 0);
eq('süresi eksik hizmet yok',
  allServices.filter(x => typeof x.duration !== 'number' || x.duration <= 0).length, 0);
eq('yinelenen hizmet id yok',
  allServices.length - new Set(allServices.map(x => x.id)).size, 0);

/* ------------------------------ seçim kuralları -------------------------- */
section('Seçim kuralları');
s = B.createState();
['lazer-tum-kol', 'lazer-sirt'].forEach(id => B.toggleService(s, id));
B.toggleService(s, 'lazer-tum-vucut');
eq('Tüm Vücut diğer lazer seçimlerini kaldırır', s.serviceIds, ['lazer-tum-vucut']);
B.toggleService(s, 'lazer-cene');
eq('bölge seçilince Tüm Vücut kalkar', s.serviceIds, ['lazer-cene']);

s = B.createState();
B.toggleService(s, 'manikur');
B.toggleService(s, 'pedikur');
eq('El & Ayak kategori içi tek seçim', s.serviceIds, ['pedikur']);

s = B.createState();
B.toggleService(s, 'cilt-bakimi');
B.toggleService(s, 'hydrafacial');
eq('Cilt Bakımı kategori içi tek seçim', s.serviceIds, ['hydrafacial']);

s = B.createState();
B.toggleService(s, 'kas-biyik');
B.toggleService(s, 'biyik-alimi');
eq('Bıyık Alımı, Kaş Bıyık\'tan ayrı hizmet', s.serviceIds, ['biyik-alimi']);

s = B.createState();
B.toggleService(s, 'manikur');
B.toggleService(s, 'lazer-cene');
B.toggleService(s, 'kirpik-lifting');
eq('kategoriler arası toplam', B.getTotal(s), 500 + 100 + 800);
eq('özet etiketi', B.getSummary(s).serviceLabel, 'Manikür, Lazer Epilasyon, Kirpik Lifting');
eq('özet bölgeleri', B.getSummary(s).regions, ['Çene']);

B.toggleService(s, 'lazer-cene');
eq('seçim kaldırma', B.getTotal(s), 1300);
eq('bölge kalmayınca lazer etiketi düşer',
  B.getSummary(s).serviceLabel, 'Manikür, Kirpik Lifting');

/* -------------------------------- çakışma -------------------------------- */
section('Randevu çakışması');
const appts = [{ date: '2026-10-10', time: '14:00', duration: 45 }];
eq('aynı saat dolu', B.hasConflict(appts, '2026-10-10', '14:00', 30), true);
eq('içine düşen saat dolu', B.hasConflict(appts, '2026-10-10', '14:30', 30), true);
eq('bitişten sonrası serbest', B.hasConflict(appts, '2026-10-10', '15:00', 30), false);
eq('öncesi 30 dk serbest', B.hasConflict(appts, '2026-10-10', '13:30', 30), false);
eq('öncesi 60 dk çakışır', B.hasConflict(appts, '2026-10-10', '13:30', 60), true);
eq('başka gün serbest', B.hasConflict(appts, '2026-10-11', '14:00', 30), false);
eq('boş listede çakışma yok', B.hasConflict([], '2026-10-10', '14:00', 30), false);
eq('undefined liste güvenli', B.hasConflict(undefined, '2026-10-10', '14:00', 30), false);

/* ------------------------- geçmiş saat / haber süresi -------------------- */
section('Geçmiş saat ve minimum haber süresi');
const now = new Date(2026, 9, 10, 14, 15);
Config.minimumNoticeMinutes = 0;
eq('geçmiş saat kapalı', B.isPastSlot('2026-10-10', '13:00', now), true);
eq('gelecek saat açık', B.isPastSlot('2026-10-10', '15:00', now), false);
eq('yarın açık', B.isPastSlot('2026-10-11', '10:00', now), false);
Config.minimumNoticeMinutes = 60;
eq('1 saat tampon: 15:00 kapalı', B.isPastSlot('2026-10-10', '15:00', now), true);
eq('1 saat tampon: 15:30 açık', B.isPastSlot('2026-10-10', '15:30', now), false);
Config.minimumNoticeMinutes = 0;

/* ------------------------------ kapalı günler ---------------------------- */
section('Kapalı günler');
eq('varsayılanda kapalı gün yok', B.isDayClosed('2026-10-11'), false);
Config.closedWeekdays = [0];                       // pazar
eq('pazar kapalı', B.isDayClosed('2026-10-11'), true);
eq('pazartesi açık', B.isDayClosed('2026-10-12'), false);
eq('kapalı günde tüm saatler kapalı',
  B.buildSlots('2026-10-11', [], 30, now).filter(x => x.available).length, 0);
eq('kapalı gün sebebi', B.buildSlots('2026-10-11', [], 30, now)[0].reason, 'closed');
eq('kapalı gün doğrulaması',
  B.validateSchedule({ date: '2026-10-11', time: '10:00' }).message,
  'Salonumuz bu tarihte kapalıdır. Lütfen başka bir gün seçin.');
Config.closedWeekdays = [];
Config.closedDates = ['2026-10-29'];
eq('tatil tarihi kapalı', B.isDayClosed('2026-10-29'), true);
eq('ertesi gün açık', B.isDayClosed('2026-10-30'), false);
Config.closedDates = [];
eq('gün listesinde kapalı bayrağı',
  B.buildDays(new Date(2026, 9, 10), 3).map(d => d.closed), [false, false, false]);

/* ------------------------------ doğrulamalar ----------------------------- */
section('Doğrulamalar');
eq('hizmetsiz devam engeli', B.validateServices(B.createState()).message, 'Lütfen önce bir hizmet seçin.');
eq('tarihsiz engel', B.validateSchedule({ date: null, time: null }).message, 'Lütfen bir tarih seçin.');
eq('saatsiz engel', B.validateSchedule({ date: '2026-10-12', time: null }).message, 'Lütfen bir saat seçin.');
eq('geçerli program', B.validateSchedule({ date: '2026-10-12', time: '10:00' }).ok, true);
eq('boş isim reddi', B.validateCustomer({ name: '', phone: '05551234567' }).field, 'name');
eq('kısa isim reddi', B.validateCustomer({ name: 'Ay', phone: '05551234567' }).ok, false);
eq('boş telefon reddi', B.validateCustomer({ name: 'Ayşe Yılmaz', phone: '' }).field, 'phone');
eq('kısa telefon reddi', B.validateCustomer({ name: 'Ayşe Yılmaz', phone: '555' }).ok, false);
eq('geçerli müşteri', B.validateCustomer({ name: 'Ayşe Yılmaz', phone: '0555 191 8058' }).ok, true);
eq('boşluklu telefon normalize', B.normalizePhone('0555 191 80 58'), '05551918058');
eq('+90 formatı korunur', B.normalizePhone('+90 555 191 8058'), '+905551918058');

/* ------------------------------ biçimlendirme ---------------------------- */
section('Biçimlendirme');
eq('uzun tarih', B.formatDateLong('2026-10-10'), '10 Ekim 2026, Cmt');
eq('kısa tarih', B.formatDateShort('2026-10-10'), '10 Eki 2026');
eq('fiyat', B.formatPrice(1310), '1310 TL');
eq('süre 45 dk', B.formatDuration(45), '45 dk');
eq('süre 60 dk', B.formatDuration(60), '1 sa');
eq('süre 90 dk', B.formatDuration(90), '1 sa 30 dk');
eq('süre 120 dk', B.formatDuration(120), '2 sa');
eq('bitiş saati', B.endTime('14:00', 45), '14:45');
eq('bitiş saati taşma', B.endTime('17:30', 90), '19:00');
eq('14 günlük liste', B.buildDays(new Date(2026, 9, 10), 14).length, 14);
eq('liste ilk günü', B.buildDays(new Date(2026, 9, 10), 14)[0].iso, '2026-10-10');
eq('liste son günü', B.buildDays(new Date(2026, 9, 10), 14)[13].iso, '2026-10-23');
eq('yıl sonu geçişi', B.buildDays(new Date(2026, 11, 30), 4).map(d => d.iso),
  ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);

/* -------------------------------- randevu -------------------------------- */
section('Randevu nesnesi');
s = B.createState();
['lazer-tum-yuz', 'lazer-cene'].forEach(id => B.toggleService(s, id));
s.date = '2026-10-10';
s.time = '14:00';
s.customer = { name: '  Ayşe Yılmaz ', phone: '0555 123 45 67', note: ' kapı zili çalışmıyor ' };
const appointment = B.buildAppointment(s);
eq('isim kırpılır', appointment.customerName, 'Ayşe Yılmaz');
eq('telefon normalize', appointment.phone, '05551234567');
eq('not kırpılır', appointment.note, 'kapı zili çalışmıyor');
eq('toplam', appointment.total, 500);
eq('süre', appointment.duration, 45);
eq('hizmet etiketi', appointment.serviceLabel, 'Lazer Epilasyon');
eq('bölgeler', appointment.regions, ['Tüm Yüz', 'Çene']);

/* ---------------------------------- ICS ---------------------------------- */
section('Takvim dosyası (.ics)');
const ics = B.buildICS(Object.assign({ id: 'apt_1' }, appointment));
eq('takvim başlangıcı', ics.includes('BEGIN:VCALENDAR'), true);
eq('takvim bitişi', ics.includes('END:VCALENDAR'), true);
eq('başlangıç saati', ics.includes('DTSTART:20261010T140000'), true);
eq('bitiş saati (45 dk)', ics.includes('DTEND:20261010T144500'), true);
eq('CRLF satır sonu', ics.includes('\r\n'), true);
eq('virgül kaçışlı', ics.includes('Tüm Yüz\\, Çene'), true);

console.log('\n================ SONUÇ ================');
console.log(`Geçen: ${passed}   Başarısız: ${failed}`);
process.exit(failed ? 1 : 0);
