# Melek Güzellik Salonu — Online Randevu Sistemi

Müşterilerin hizmet seçip gün ve saat belirleyerek randevu oluşturabildiği,
personelin ise şifre korumalı bir panelden randevuları yönettiği çalışan bir
randevu uygulaması. Bağımlılık yok: sade HTML, CSS ve JavaScript.

Salon tek personelle çalıştığı için sistem **aynı anda tek randevuya** izin verir.

---

## İçindekiler

- [Projeyi Çalıştırma](#projeyi-çalıştırma)
- [İlk Kurulumda Yapılacaklar](#ilk-kurulumda-yapılacaklar)
- [Özellikler](#özellikler)
- [Dosya Yapısı](#dosya-yapısı)
- [Ayarlar](#ayarlar)
- [Güvenlik](#güvenlik)
- [Veri Saklama ve Yedekleme](#veri-saklama-ve-yedekleme)
- [Gerçek Veritabanına Geçiş](#gerçek-veritabanına-geçiş)
- [Test](#test)

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

| Sayfa | Adres |
| --- | --- |
| Müşteri randevu sayfası | <http://localhost:8000/index.html> |
| Yönetici paneli | <http://localhost:8000/admin/> |

### 2. Yöntem — Dosyayı doğrudan açma

`index.html` dosyasına çift tıklayarak da açabilirsiniz. Chrome ve Edge'de
randevu kaydı sorunsuz çalışır; ancak bazı tarayıcılar `file://` adreslerinde
tarayıcı depolamasını kısıtlar. Bu durumda uygulama hata vermez, randevular
yalnızca sayfa kapanana kadar bellekte tutulur. Günlük kullanım için 1. yöntem
tercih edilmelidir.

### Yayına alma

Statik bir projedir; derleme adımı yoktur. Klasörü olduğu gibi herhangi bir
statik hosting hizmetine (Netlify, Vercel, GitHub Pages, paylaşımlı hosting)
yükleyebilirsiniz.

---

## İlk Kurulumda Yapılacaklar

1. **Yönetici şifresini değiştirin.** `js/config.js` içindeki `adminPasscode`
   satırını kendi şifrenizle değiştirin. Varsayılan şifre herkese açıktır.
2. **Kapalı günlerinizi girin.** Haftalık izin gününüz varsa `closedWeekdays`
   ayarını doldurun (örn. pazar için `[0]`).
3. **Çalışma saatlerinizi kontrol edin.** `timeSlots` listesi randevu
   verilebilecek saatleri belirler.
4. **Fiyatları gözden geçirin.** Hizmetler ve fiyatlar `js/data.js` içindedir.

---

## Özellikler

### Müşteri akışı (4 adım)

1. **Hizmet seçimi** — kategorilere ayrılmış kartlar, anlık fiyat toplamı,
   seçilenlerin tek tek kaldırılabildiği özet etiketleri
2. **Tarih ve saat** — 14 günlük takvim, dolu ve geçmiş saatler seçilemez
3. **Bilgiler** — ad soyad, telefon, isteğe bağlı not ve randevu özeti
4. **Onay** — randevu kaydı, özet ve **takvime ekleme** (.ics indirir)

Adım göstergesindeki tamamlanmış adımlara tıklayarak geri dönülebilir;
seçimler korunur.

### Seçim kuralları

- Lazer epilasyonda **birden fazla bölge** seçilebilir, fiyatlar anında toplanır.
- **Tüm Vücut Tek Seans** seçilirse diğer lazer bölgeleri otomatik kaldırılır;
  tersi durumda da (bir bölge seçilirse) Tüm Vücut seçimi kaldırılır.
- El & Ayak, Cilt Bakımı, Kaş & Kirpik kategorilerinde kategori başına tek
  hizmet seçilir; farklı kategorilerden seçimler birlikte yapılabilir ve
  toplam fiyata eklenir.
- Hizmet seçilmeden tarih adımına, tarih seçilmeden saat seçimine, saat
  seçilmeden bilgiler adımına geçilemez.

### Randevu çakışması

Salon tek personelle çalıştığı için çakışma **hizmet süreleri üzerinden**
hesaplanır: 14:00'te alınan 45 dakikalık bir randevu 14:30 dilimini de
otomatik kapatır. Dolu saatler müşteri tarafında devre dışı görünür ve kayıt
anında çakışma bir kez daha kontrol edilir (iki kişi aynı anda işlem yapsa
bile ikinci kayıt engellenir).

> Yalnızca birebir saat eşleşmesini engellemek isterseniz `js/booking.js`
> içindeki `hasConflict()` fonksiyonunu sadeleştirmeniz yeterlidir.

### Yönetici paneli (`/admin`)

- **Şifre korumalı giriş** — oturum sekme kapanana kadar sürer, "Çıkış" butonu var
- **Telefonla gelen randevu ekleme** — hizmet, tarih, saat, isim, telefon ve not;
  dolu saatler listede kapalı gelir, çakışma kontrolü uygulanır
- **Filtreler** — Bugün / Yarın / Bu Hafta / Yaklaşan / Geçmiş / Tümü
- **Arama** — isim, telefon, hizmet, bölge, not veya tarihe göre
- **Özet** — bugünkü randevu, yaklaşan randevu, toplam kayıt ve günlük ciro
- **Durum işaretleme** — Geldi / Gelmedi (tekrar basınca işaret kalkar)
- **Silme** — onay sorulur
- **Yazdırma** — günün listesi için sade çıktı
- **Yedekleme** — JSON yedek indirme, JSON'dan geri yükleme, Excel için CSV

Randevular tarih ve saate göre sıralanır; müşteri adı, tıklanabilir telefon,
hizmet, lazer bölgeleri, yaklaşık süre, not ve toplam ücret gösterilir.

---

## Dosya Yapısı

```
melek-guzellik/
├── index.html          Müşteri randevu sayfası
├── admin/
│   └── index.html      Yönetici paneli
├── css/
│   └── style.css       Tüm stiller (müşteri + admin + yazdırma)
├── js/
│   ├── config.js       SALON AYARLARI — şifre, saatler, kapalı günler
│   ├── data.js         Hizmet katalogu: fiyatlar ve süreler
│   ├── store.js        Randevu deposu (MVP: localStorage)
│   ├── booking.js      Saf iş mantığı: seçim, fiyat, çakışma, doğrulama, .ics
│   ├── app.js          Müşteri akışının arayüz denetleyicisi
│   └── admin.js        Yönetici panelinin arayüz denetleyicisi
├── tests/
│   ├── logic.js        İş mantığı testleri (tarayıcı gerekmez)
│   └── e2e.js          Uçtan uca tarayıcı testleri (Playwright)
└── README.md
```

---

## Ayarlar

Günlük kullanımda değiştirilecek her şey **`js/config.js`** dosyasındadır:

| Ayar | Açıklama |
| --- | --- |
| `salon` | Salon adı, telefon numarası ve WhatsApp numarası |
| `adminPasscode` | Yönetici paneli şifresi — **mutlaka değiştirin** |
| `timeSlots` | Randevu verilebilecek saatler |
| `bookableDays` | Müşteriye kaç günlük takvim gösterilecek (varsayılan 14) |
| `closedWeekdays` | Haftalık kapalı günler — `0` pazar, `6` cumartesi |
| `closedDates` | Tatil/izin tarihleri, örn. `['2026-10-29']` |
| `minimumNoticeMinutes` | Randevunun en az kaç dakika öncesinden alınabileceği |

Fiyatlar, süreler ve kategoriler **`js/data.js`** içindedir. Yeni hizmet
eklemek için ilgili kategoriye bir satır eklemeniz yeterlidir; başka dosyaya
dokunmak gerekmez:

```js
{ id: 'yeni-hizmet', name: 'Yeni Hizmet', price: 750, duration: 45 }
```

Süreler (`duration`) müşteriye hizmet kartlarında gösterilmez, ancak randevu
çakışmasının hesaplanmasında kullanılır ve özet ekranında "tahmini süre"
olarak görünür.

---

## Güvenlik

> **Yönetici şifresi gerçek bir güvenlik önlemi değildir.**
>
> Şifre tarayıcıda, `js/config.js` dosyasında saklanır. Bu dosyayı açmayı
> bilen biri şifreyi görebilir. Panelin şifreyle korunması yalnızca paneli
> kazara veya meraktan açılmaktan korur.
>
> Panelde müşteri adı ve telefon numarası gibi kişisel veriler bulunur. Siteyi
> internete açıyorsanız, `/admin` klasörünü **hosting tarafında** da koruyun:
>
> - Apache kullanıyorsanız `.htpasswd` ile HTTP Basic Auth
> - Netlify kullanıyorsanız site veya klasör bazlı parola koruması
> - Ya da paneli internete hiç açmayıp yalnızca salondaki cihazda kullanın
>
> Gerçek bir kullanıcı sistemi ancak backend'e geçildiğinde mümkündür.

---

## Veri Saklama ve Yedekleme

> **Önemli — MVP notu:** Bu sürümde randevular tarayıcının `localStorage`
> alanında, `melekAppointments` anahtarı altında JSON olarak saklanır.
> Veriler **sunucuda değil, o cihazın tarayıcısında** tutulur. Bunun pratik
> sonuçları:
>
> - Müşterinin telefonundan oluşturduğu randevu, salondaki bilgisayarın
>   yönetici panelinde **görünmez**.
> - Tarayıcı verileri temizlenirse randevular silinir.
>
> Bu nedenle panelde yedekleme bölümü bulunur. Düzenli olarak **Yedek İndir
> (JSON)** ile kayıt alın; gerektiğinde **Yedekten Geri Yükle** ile aynı
> dosyadan geri dönebilirsiniz.
>
> Sistemi gerçek kullanıma alacaksanız bir backend'e geçilmesi gerekir.

---

## Gerçek Veritabanına Geçiş

Veri erişimi tamamen `js/store.js` içinde toplanmıştır ve tüm metotlar
`Promise` döner. Çağıran kod (`app.js`, `admin.js`) depolamanın nasıl
çalıştığını bilmez; bu yüzden backend'e geçerken **yalnızca bu dosya**
değiştirilir:

```js
MelekStore.list       = ()       => fetch('/api/randevular').then(r => r.json());
MelekStore.create     = (a)      => fetch('/api/randevular', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(a)
                                    }).then(r => r.json());
MelekStore.update     = (id, p)  => fetch('/api/randevular/' + id, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(p)
                                    }).then(r => r.json());
MelekStore.remove     = (id)     => fetch('/api/randevular/' + id, { method: 'DELETE' });
```

Randevu kaydının yapısı:

```json
{
  "id": "apt_...",
  "createdAt": "2026-09-24T10:00:00.000Z",
  "customerName": "Ayşe Yılmaz",
  "phone": "05551234567",
  "note": "İlk seansım",
  "date": "2026-09-24",
  "time": "12:00",
  "serviceIds": ["lazer-tum-yuz", "lazer-cene"],
  "services": [{ "id": "...", "name": "...", "price": 400, "duration": 30 }],
  "serviceLabel": "Lazer Epilasyon",
  "regions": ["Tüm Yüz", "Çene"],
  "total": 500,
  "duration": 45,
  "status": null,
  "source": "admin"
}
```

Çakışma kontrolünü sunucuya taşırken `booking.js` içindeki `hasConflict()`
mantığı birebir kullanılabilir. Backend'e geçildiğinde çakışma kontrolünün
**sunucu tarafında da** yapılması gerekir.

---

## Test

İki test paketi vardır.

### İş mantığı testleri (hızlı, tarayıcı gerekmez)

```bash
node tests/logic.js
```

Fiyat hesaplama, seçim kuralları, çakışma, kapalı günler, doğrulamalar,
biçimlendirme ve takvim dosyası üretimini kapsar.

### Uçtan uca testler (gerçek Chromium)

```bash
# 1. terminal
python3 -m http.server 8123

# 2. terminal
node tests/e2e.js
```

Şartnamedeki 12 senaryonun tamamı ile giriş koruması, elle randevu ekleme,
arama, filtreler, durum işaretleme, yedekleme/geri yükleme, erişilebilirlik,
console hatası kontrolü ve 375–1440px responsive kontrolünü kapsar.

**Son çalıştırma: 78 + 165 = 243 kontrol başarılı, 0 başarısız, console hatası yok.**

---

## Tarayıcı Desteği

Chrome, Edge, Safari, Firefox'un güncel sürümleri ve mobil tarayıcılar.
Kurulum ve derleme gerektirmez.

## İletişim

**Melek Güzellik Salonu** — 0555 191 8058
