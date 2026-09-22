# Melek Güzellik Salonu — Online Randevu Sistemi

Müşterilerin hizmet seçip gün ve saat belirleyerek randevu oluşturduğu,
personelin ise şifre korumalı bir panelden randevuları yönettiği randevu
sistemi. Ön yüz ve backend birlikte gelir.

**Kurulum gerektirmez:** Node.js dışında hiçbir bağımlılık yoktur.
`npm install` çalıştırmanız gerekmez, derleme adımı yoktur.

Salon tek personelle çalıştığı için sistem **aynı anda tek randevuya** izin verir.

---

## İçindekiler

- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Çalışma Modları](#çalışma-modları)
- [İlk Kurulumda Yapılacaklar](#ilk-kurulumda-yapılacaklar)
- [Özellikler](#özellikler)
- [Dosya Yapısı](#dosya-yapısı)
- [Ayarlar](#ayarlar)
- [API Uçları](#api-uçları)
- [Güvenlik](#güvenlik)
- [Sunucuya Kurulum](#sunucuya-kurulum)
- [Yedekleme](#yedekleme)
- [Test](#test)

---

## Hızlı Başlangıç

Node.js 22.5 veya üstü gerekir (`node --version` ile kontrol edin).

```bash
# Yönetici şifrenizi belirleyip sunucuyu başlatın
MELEK_ADMIN_PASSWORD='kendi-sifreniz' npm start
```

| Sayfa | Adres |
| --- | --- |
| Müşteri randevu sayfası | <http://localhost:3000> |
| Yönetici paneli | <http://localhost:3000/admin/> |

Randevular `data/melek.db` dosyasındaki SQLite veritabanında saklanır.
Bu dosya ilk çalıştırmada otomatik oluşturulur.

---

## Çalışma Modları

Ön yüz açılışta sunucunun olup olmadığını kendisi anlar ve iki moddan
birinde çalışır. Kod tarafında bir ayar yapmanız gerekmez.

| | **API modu** (önerilen) | **Yerel mod** |
| --- | --- | --- |
| Ne zaman | Sunucu çalışıyorken (`npm start`) | Sunucu yokken: `index.html`'i çift tıklayınca veya statik hostingde |
| Veri nerede | Sunucudaki SQLite veritabanı | Yalnızca o tarayıcının `localStorage` alanı |
| Cihazlar arası | ✅ Müşterinin telefonundan alınan randevu salondaki bilgisayarda görünür | ❌ Her cihaz kendi verisini görür |
| Fiyat hesabı | Sunucuda — istemci fiyat gönderemez | Tarayıcıda |
| Çakışma kontrolü | Sunucuda, işlem (transaction) içinde | Tarayıcıda |
| Panel şifresi | `MELEK_ADMIN_PASSWORD` (sunucu) | `js/config.js` içindeki `adminPasscode` |
| Oturum | HttpOnly çerez, sunucuda doğrulanır | `sessionStorage` |

Yerel mod, sunucuya erişilemediğinde sistemin tamamen durmaması için
vardır; gerçek kullanım için **API modu** tercih edilmelidir.

---

## İlk Kurulumda Yapılacaklar

1. **Yönetici şifresini belirleyin.** `MELEK_ADMIN_PASSWORD` ortam
   değişkenini ayarlayın. Ayarlanmazsa sunucu varsayılan şifreyle çalışır
   ve açılışta uyarı verir.
2. **Kapalı günlerinizi girin.** Haftalık izin gününüz varsa `js/config.js`
   içindeki `closedWeekdays` ayarını doldurun (örn. pazar için `[0]`).
3. **Çalışma saatlerinizi kontrol edin.** `js/config.js` → `timeSlots`.
4. **Fiyatları gözden geçirin.** `js/data.js`.
5. **Yedeklemeyi kurun.** [Yedekleme](#yedekleme) bölümüne bakın.

---

## Özellikler

### Müşteri akışı (4 adım)

1. **Hizmet seçimi** — kategorilere ayrılmış kartlar, anlık fiyat toplamı,
   seçilenlerin tek tek kaldırılabildiği özet etiketleri
2. **Tarih ve saat** — 14 günlük takvim; dolu, geçmiş ve kapalı günler seçilemez
3. **Bilgiler** — ad soyad, telefon, isteğe bağlı not ve randevu özeti
4. **Onay** — randevu kaydı, özet ve takvime ekleme (.ics indirir)

Adım göstergesindeki tamamlanmış adımlara tıklanarak geri dönülebilir.

### Seçim kuralları

- Lazer epilasyonda **birden fazla bölge** seçilebilir, fiyatlar anında toplanır.
- **Tüm Vücut Tek Seans** seçilirse diğer lazer bölgeleri otomatik kaldırılır;
  bir bölge seçilirse de Tüm Vücut seçimi kaldırılır.
- El & Ayak, Cilt Bakımı, Kaş & Kirpik kategorilerinde kategori başına tek
  hizmet seçilir; farklı kategorilerden seçimler birlikte yapılabilir.
- Bu kurallar API modunda **sunucuda da** uygulanır.

### Randevu çakışması

Çakışma, hizmet süreleri üzerinden hesaplanır: 14:00'te alınan 45 dakikalık
bir randevu 14:30 dilimini de kapatır. Dolu saatler müşteriye devre dışı
gösterilir; kayıt anında sunucu kontrolü tekrarlar.

Kontrol ile kayıt **tek bir veritabanı işlemi içinde** yapılır. İki müşteri
aynı saati aynı anda seçse bile yalnızca biri kaydedilir — bu, otomatik
testte beş eşzamanlı istekle doğrulanmaktadır.

### Yönetici paneli (`/admin`)

- **Şifre korumalı giriş** — sunucuda doğrulanır, HttpOnly çerez kullanılır
- **Telefonla gelen randevu ekleme** — dolu saatler listede kapalı gelir
- **Filtreler** — Bugün / Yarın / Bu Hafta / Yaklaşan / Geçmiş / Tümü
- **Arama** — isim, telefon, hizmet, bölge, not veya tarihe göre
- **Özet** — bugünkü randevu, yaklaşan randevu, toplam kayıt, günlük ciro
- **Durum işaretleme** — Geldi / Gelmedi
- **Silme** — onay sorulur
- **Yazdırma** — günün listesi için sade çıktı
- **Yedekleme** — JSON yedek indirme, geri yükleme, Excel için CSV

---

## Dosya Yapısı

```
melek-guzellik/
├── index.html              Müşteri randevu sayfası
├── admin/index.html        Yönetici paneli
├── css/style.css           Tüm stiller (müşteri + admin + yazdırma)
│
├── js/                     Ön yüz (tarayıcıda çalışır)
│   ├── config.js           SALON AYARLARI — saatler, kapalı günler
│   ├── data.js             Hizmet katalogu: fiyatlar ve süreler
│   ├── booking.js          Saf iş mantığı — sunucu da bunu kullanır
│   ├── store.js            Veri katmanı: API / yerel mod seçimi
│   ├── app.js              Müşteri akışı arayüzü
│   └── admin.js            Yönetici paneli arayüzü
│
├── server/                 Backend (Node.js, bağımlılıksız)
│   ├── server.js           HTTP sunucusu, rotalar, statik dosyalar
│   ├── config.js           Sunucu ayarları (ortam değişkenleri)
│   ├── db.js               SQLite bağlantısı ve şema
│   ├── appointments.js     Randevu kuralları ve veri erişimi
│   ├── auth.js             Oturum, şifre, deneme sınırı
│   └── http-helpers.js     İstek/yanıt yardımcıları
│
├── deploy/                 Sunucuya kurulum örnekleri
│   ├── melek.service       systemd servis dosyası
│   ├── nginx.conf          HTTPS + ters vekil örneği
│   └── yedekle.sh          Günlük otomatik yedek betiği
│
├── tests/
│   ├── logic.js            İş mantığı testleri
│   ├── api.js              Backend API testleri
│   ├── e2e.js              Tarayıcı testleri (yerel mod)
│   └── e2e-api.js          Tarayıcı testleri (API modu)
│
├── data/melek.db           Veritabanı (otomatik oluşur, git'e girmez)
├── .env.example            Ortam değişkeni örneği
└── package.json
```

`js/booking.js` hem tarayıcıda hem sunucuda çalışır. Fiyat hesabı, çakışma
mantığı ve doğrulama kuralları böylece tek bir yerde tanımlıdır.

---

## Ayarlar

### Salon ayarları — `js/config.js`

| Ayar | Açıklama |
| --- | --- |
| `salon` | Salon adı ve telefon numarası (sayfalardaki tüm arama bağlantıları buradan beslenir) |
| `timeSlots` | Randevu verilebilecek saatler |
| `bookableDays` | Müşteriye kaç günlük takvim gösterilecek (varsayılan 14) |
| `closedWeekdays` | Haftalık kapalı günler — `0` pazar, `6` cumartesi |
| `closedDates` | Tatil/izin tarihleri, örn. `['2026-10-29']` |
| `minimumNoticeMinutes` | Randevunun en az kaç dakika öncesinden alınabileceği |
| `adminPasscode` | **Yalnızca yerel modda** geçerli panel şifresi |

### Sunucu ayarları — ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `MELEK_ADMIN_PASSWORD` | `melek2026` | Panel şifresi — **mutlaka değiştirin** |
| `PORT` | `3000` | Dinlenecek port |
| `MELEK_DB` | `data/melek.db` | Veritabanı dosyasının yolu |
| `MELEK_SECURE_COOKIES` | kapalı | HTTPS arkasındaysanız `1` yapın |
| `MELEK_SESSION_HOURS` | `12` | Oturumun açık kalma süresi |
| `MELEK_ALLOWED_ORIGIN` | boş | Ön yüz ayrı adresteyse o adres |
| `MELEK_LOGIN_MAX_ATTEMPTS` | `10` | Giriş denemesi sınırı |

Örnek için `.env.example` dosyasına bakın.

### Fiyat ve hizmetler — `js/data.js`

Yeni hizmet eklemek için ilgili kategoriye bir satır eklemek yeterlidir:

```js
{ id: 'yeni-hizmet', name: 'Yeni Hizmet', price: 750, duration: 45 }
```

`duration` müşteriye hizmet kartlarında gösterilmez; çakışma hesabında
kullanılır ve özette "tahmini süre" olarak görünür.

> Fiyat değişikliği geçmiş randevuları etkilemez: her randevu, oluşturulduğu
> andaki hizmet ve fiyat bilgisini kendi içinde saklar.

---

## API Uçları

### Herkese açık

| Yöntem | Adres | Açıklama |
| --- | --- | --- |
| `GET` | `/api/health` | Sunucu ayakta mı |
| `GET` | `/api/services` | Hizmet katalogu |
| `GET` | `/api/days` | Takvim günleri (kapalı gün bilgisiyle) |
| `GET` | `/api/availability?date=&duration=` | Bir günün saat durumu |
| `POST` | `/api/appointments` | Randevu oluştur |

`/api/availability` yalnızca `{ time, available, reason }` döner. Başka
müşterilerin adı, telefonu veya hizmeti **hiçbir zaman** açığa çıkmaz.

`POST /api/appointments` gövdesi:

```json
{
  "serviceIds": ["lazer-tum-yuz", "lazer-cene"],
  "date": "2026-10-10",
  "time": "14:00",
  "customerName": "Ayşe Yılmaz",
  "phone": "05551234567",
  "note": "İlk seansım"
}
```

> Fiyat, süre ve hizmet adları istemciden **alınmaz**. Gövdeye `total`
> yazsanız bile yoksayılır; tutarlar sunucudaki katalogdan hesaplanır.

### Giriş gerektiren

| Yöntem | Adres | Açıklama |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Giriş (çerez verir) |
| `POST` | `/api/admin/logout` | Çıkış |
| `GET` | `/api/admin/session` | Oturum durumu |
| `GET` | `/api/admin/appointments` | Tüm randevular + istatistikler |
| `POST` | `/api/admin/appointments` | Elle randevu ekle |
| `PATCH` | `/api/admin/appointments/:id` | Durum güncelle |
| `DELETE` | `/api/admin/appointments/:id` | Randevu sil |
| `POST` | `/api/admin/appointments/import` | Yedekten geri yükle |

---

## Güvenlik

Sistemde uygulananlar:

- Fiyat, süre ve hizmet adları sunucuda hesaplanır; istemci gönderemez.
- Müşteri tarafına başka randevuların kişisel bilgileri açılmaz.
- Şifre sabit zamanlı karşılaştırılır, tarayıcıda saklanmaz.
- Oturum anahtarı rastgele üretilir, veritabanında tutulur, süresi dolar.
- Çerez `HttpOnly` ve `SameSite=Lax` işaretlidir.
- Giriş denemeleri IP başına sınırlanır (varsayılan: 15 dakikada 10).
- `data/`, `server/`, `tests/` ve `.git/` dizinleri web üzerinden sunulmaz;
  dizin dışına çıkma (path traversal) denemeleri reddedilir.
- Gövde boyutu sınırlanır, `X-Content-Type-Options` ve `X-Frame-Options`
  başlıkları gönderilir.

Sizin yapmanız gerekenler:

1. **Şifreyi değiştirin.** `MELEK_ADMIN_PASSWORD` ayarlanmazsa sunucu
   açılışta uyarı basar.
2. **HTTPS kullanın.** Panel üzerinden müşteri adı ve telefonu geçer.
   `deploy/nginx.conf` örneğine bakın, `MELEK_SECURE_COOKIES=1` yapın.
3. **İsterseniz paneli ikinci bir katmanla koruyun.** nginx `auth_basic`
   örneği `deploy/nginx.conf` içinde yorum satırı olarak hazır.

> **Yerel mod uyarısı:** Sunucusuz kullanımda panel şifresi `js/config.js`
> içindedir ve dosyayı açan herkes görebilir. Bu yalnızca paneli kazara
> açılmaktan korur. Gerçek koruma API modunda sağlanır.

---

## Sunucuya Kurulum

### Kendi sunucunuzda (VPS)

```bash
# 1. Dosyaları sunucuya kopyalayın
sudo mkdir -p /var/www/melek-guzellik
sudo rsync -a ./ /var/www/melek-guzellik/

# 2. Şifreyi ayarlayın
echo "MELEK_ADMIN_PASSWORD='guclu-bir-sifre'" | sudo tee /etc/melek.env
sudo chmod 600 /etc/melek.env

# 3. Servisi kurun
sudo cp deploy/melek.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now melek

# 4. nginx + HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/melek
sudo ln -s /etc/nginx/sites-available/melek /etc/nginx/sites-enabled/
sudo certbot --nginx -d melekguzellik.com
```

Durum kontrolü: `sudo systemctl status melek`
Günlükler: `sudo journalctl -u melek -f`

### Hazır platformlarda (Railway, Render, Fly.io)

Depoyu bağlayın ve şu ayarları girin:

- Başlatma komutu: `npm start`
- Ortam değişkeni: `MELEK_ADMIN_PASSWORD`
- **Kalıcı disk** bağlayın ve `MELEK_DB` değişkenini o diske yönlendirin
  (örn. `/data/melek.db`). Aksi halde her dağıtımda randevular silinir.

### Statik hosting (Netlify, GitHub Pages)

Bu platformlar Node.js çalıştırmaz; sistem **yerel modda** çalışır ve
cihazlar arası paylaşım olmaz. Salon için uygun değildir.

---

## Yedekleme

Veritabanı tek bir dosyadır: `data/melek.db`.

**Otomatik (önerilen).** `deploy/yedekle.sh` her gece yedek alır ve 30
günden eskileri siler:

```bash
crontab -e
0 3 * * * /var/www/melek-guzellik/deploy/yedekle.sh
```

**Elle.** Panelden **Yedek İndir (JSON)** ile dosya alabilir, **Yedekten
Geri Yükle** ile aynı dosyadan dönebilirsiniz. Geri yükleme mevcut
kayıtların tamamını değiştirir; onay sorulur.

> Veritabanı dosyasını kopyalarken sunucu çalışıyorsa `cp` yerine
> `sqlite3 data/melek.db ".backup hedef.db"` kullanın — betik bunu yapar.

---

## Test

Dört test paketi vardır; toplam **383 kontrol**.

```bash
npm test            # iş mantığı (78) + API (96)  — tarayıcı gerekmez
npm run test:e2e    # tarayıcı, yerel mod (170)   — Playwright gerekir
npm run test:e2e-api # tarayıcı, API modu (39)
npm run test:all    # hepsi
```

`npm run test:e2e` için önce statik bir sunucu gerekir:

```bash
python3 -m http.server 8123     # ayrı bir terminalde
```

Diğer paketler kendi sunucularını geçici bir veritabanıyla kendileri
başlatır; mevcut verilerinize dokunmazlar.

Kapsam: şartnamedeki 12 senaryo, fiyat bütünlüğü, kişisel veri sızıntısı,
eşzamanlı istek yarışı, oturum ve yetki kontrolleri, giriş deneme sınırı,
dosya erişim koruması, yedekleme/geri yükleme, erişilebilirlik, console
hatası kontrolü ve 375–1440px responsive kontrolü.

**Son çalıştırma: 383 kontrol başarılı, 0 başarısız, console hatası yok.**

---

## Tarayıcı Desteği

Chrome, Edge, Safari, Firefox'un güncel sürümleri ve mobil tarayıcılar.

## İletişim

**Melek Güzellik Salonu** — 0555 191 8058
