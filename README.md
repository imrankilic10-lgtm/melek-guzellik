# Melek Güzellik Salonu — Online Randevu Sistemi

Müşterilerin hizmet seçip gün ve saat belirleyerek randevu oluşturabildiği,
personelin ise randevuları ayrı bir panelden yönetebildiği çalışan bir randevu
uygulaması. Bağımlılık yok: sade HTML, CSS ve JavaScript.

Salon tek personelle çalıştığı için sistem **aynı anda tek randevuya** izin verir.

---

## Projeyi Çalıştırma

### 1. Yöntem — Yerel sunucu (önerilen)

Proje klasöründe bir terminal açın:

```bash
# Python 3 ile
python3 -m http.server 8000

# veya Node.js ile
npx http-server -p 8000
```

Ardından tarayıcıda açın:

- Müşteri sayfası: <http://localhost:8000/index.html>
- Yönetici paneli: <http://localhost:8000/admin/>

### 2. Yöntem — Dosyayı doğrudan açma

`index.html` dosyasına çift tıklayarak da açabilirsiniz. Chrome ve Edge'de
randevu kaydı sorunsuz çalışır; ancak bazı tarayıcılar `file://` adreslerinde
tarayıcı depolamasını kısıtlar. Bu durumda uygulama hata vermez, randevular
yalnızca sayfa kapanana kadar bellekte tutulur. Günlük kullanım için 1. yöntem
tercih edilmelidir.

### Yayına alma

Statik bir projedir; herhangi bir statik hosting hizmetine (Netlify, Vercel,
GitHub Pages, paylaşımlı hosting) klasör olduğu gibi yüklenebilir.

---

## Özellikler

### Müşteri akışı (4 adım)

1. **Hizmet seçimi** — kategorilere ayrılmış hizmet kartları, anlık fiyat toplamı
2. **Tarih ve saat** — 14 günlük takvim, 16 saatlik zaman aralığı
3. **Bilgiler** — ad soyad, telefon ve randevu özeti
4. **Onay** — randevu kaydı ve özet ekranı

### Kurallar

- Lazer epilasyonda **birden fazla bölge** seçilebilir, fiyatlar anında toplanır.
- **Tüm Vücut Tek Seans** seçilirse diğer lazer bölgeleri otomatik kaldırılır;
  tersi durumda da (bir bölge seçilirse) Tüm Vücut seçimi kaldırılır.
- El & Ayak, Cilt Bakımı, Kaş & Kirpik kategorilerinde kategori başına tek
  hizmet seçilir; farklı kategorilerden seçimler birlikte yapılabilir ve
  toplam fiyata eklenir.
- Hizmet seçilmeden tarih adımına, tarih seçilmeden saat seçimine, saat
  seçilmeden bilgiler adımına geçilemez.
- **Dolu saatler** müşteri tarafında devre dışı görünür; geçmiş saatler de
  seçilemez. Kayıt anında çakışma bir kez daha kontrol edilir.

### Yönetici paneli (`/admin`)

- Bugün / Yarın / Yaklaşan / Tüm Randevular filtreleri
- Bugünkü randevu, yaklaşan randevu, toplam kayıt ve günlük ciro özeti
- Müşteri adı, tıklanabilir telefon, hizmet, lazer bölgeleri, tarih, saat,
  yaklaşık süre ve toplam ücret
- Tarih ve saate göre sıralama
- Onay sorulu **Sil** butonu

---

## Dosya Yapısı

```
melek-guzellik/
├── index.html          Müşteri randevu sayfası
├── admin/
│   └── index.html      Yönetici paneli
├── css/
│   └── style.css       Tüm stiller (müşteri + admin)
├── js/
│   ├── data.js         Salon bilgisi, hizmet katalogu, fiyat ve süreler
│   ├── store.js        Randevu deposu (MVP: localStorage)
│   ├── booking.js      Saf iş mantığı: seçim, fiyat, çakışma, doğrulama
│   ├── app.js          Müşteri akışının arayüz denetleyicisi
│   └── admin.js        Yönetici panelinin arayüz denetleyicisi
├── tests/
│   └── e2e.js          Uçtan uca tarayıcı testleri (Playwright)
└── README.md
```

---

## Veri Saklama — MVP Notu

> **Önemli:** Bu ilk sürümde randevular tarayıcının `localStorage` alanında,
> `melekAppointments` anahtarı altında JSON olarak saklanır. Bu yalnızca MVP
> içindir. Veriler **sunucuda değil, o cihazın tarayıcısında** tutulur; yani
> telefondan oluşturulan bir randevu, salondaki bilgisayarın yönetici panelinde
> görünmez. Tarayıcı verileri temizlenirse randevular da silinir.

### Gerçek veritabanına geçiş

Veri erişimi tamamen `js/store.js` içinde toplanmıştır ve tüm metotlar
`Promise` döner. Çağıran kod (`app.js`, `admin.js`) depolamanın nasıl
çalıştığını bilmez; bu yüzden backend'e geçerken **yalnızca bu dosya**
değiştirilir:

```js
// Örnek: REST API adaptörü
MelekStore.useAdapter({
  readAll: /* ... */,
  writeAll: /* ... */
});
```

veya doğrudan `MelekStore` metotlarını `fetch` ile değiştirin:

```js
MelekStore.list   = () => fetch('/api/randevular').then(r => r.json());
MelekStore.create = (a) => fetch('/api/randevular', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(a)
}).then(r => r.json());
MelekStore.remove = (id) => fetch('/api/randevular/' + id, { method: 'DELETE' });
```

Randevu kaydının yapısı:

```json
{
  "id": "apt_...",
  "createdAt": "2026-09-22T10:00:00.000Z",
  "customerName": "Ayşe Yılmaz",
  "phone": "05551234567",
  "date": "2026-09-24",
  "time": "12:00",
  "serviceIds": ["lazer-tum-yuz", "lazer-cene"],
  "services": [{ "id": "...", "name": "...", "price": 400, "duration": 30 }],
  "serviceLabel": "Lazer Epilasyon",
  "regions": ["Tüm Yüz", "Çene"],
  "total": 500,
  "duration": 45
}
```

Çakışma kontrolü sunucuya taşınırken `booking.js` içindeki `hasConflict()`
mantığı birebir kullanılabilir.

---

## Hizmet ve Süre Yönetimi

Fiyatlar, süreler ve kategoriler yalnızca `js/data.js` içinde tanımlıdır.
Fiyat güncellemek veya yeni hizmet eklemek için başka dosyaya dokunmak
gerekmez:

```js
{ id: 'yeni-hizmet', name: 'Yeni Hizmet', price: 750, duration: 45 }
```

Süreler (`duration`) müşteriye gösterilmez ancak randevu çakışmasının
hesaplanmasında kullanılır: 60 dakikalık bir randevu, sonraki yarım saatlik
dilimi de otomatik olarak kapatır.

Çalışma saatlerini değiştirmek için `TIME_SLOTS`, gösterilecek gün sayısı için
`BOOKABLE_DAYS` düzenlenir.

---

## Test

Uçtan uca testler gerçek Chromium tarayıcısında çalışır ve şartnamedeki 12
senaryonun tamamını kapsar (fiyat toplama, Tüm Vücut kuralı, adım kilitleri,
çakışma engeli, admin listeleme/silme, console hatası kontrolü, 375–1440px
responsive kontrolü).

```bash
# 1. terminal
python3 -m http.server 8123

# 2. terminal
node tests/e2e.js
```

Son çalıştırma: **100 kontrol başarılı, 0 başarısız, console hatası yok.**

---

## Tarayıcı Desteği

Chrome, Edge, Safari, Firefox'un güncel sürümleri ve mobil tarayıcılar.
Yapı kurulum gerektirmez, derleme adımı yoktur.

## İletişim

**Melek Güzellik Salonu** — 0555 191 8058
