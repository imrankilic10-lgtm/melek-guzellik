# Railway'e Kurulum

Bu rehber sistemi Railway üzerinde yayına almanızı sağlar. Yaklaşık 10 dakika sürer.

Depoda hazır gelen `railway.json` ve `.nvmrc` dosyaları sayesinde Railway
başlatma komutunu ve Node.js sürümünü kendiliğinden doğru seçer.

---

## 1. Projeyi oluşturun

1. [railway.app](https://railway.app) → **New Project**
2. **Deploy from GitHub repo** seçin
3. GitHub hesabınızı bağlayın ve `melek-guzellik` deposunu seçin
4. Railway kurulumu başlatır

> **Dal kontrolü:** Servis → **Settings** → **Source** bölümünde dalın
> `claude/melek-beauty-booking-system-9cqobt` olduğundan emin olun.

İlk kurulum bu haliyle çalışır ama **randevular kalıcı olmaz**. Aşağıdaki
iki adım şart.

---

## 2. Kalıcı disk ekleyin  ⚠️ EN ÖNEMLİ ADIM

Railway'de uygulamanın dosya sistemi her yeni dağıtımda sıfırlanır.
Veritabanı dosyası kalıcı bir diske konmazsa **her güncellemede tüm
randevular silinir.**

1. Servisin üzerine sağ tıklayın → **Add Volume**
   (veya Servis → **Settings** → **Volumes** → **Add Volume**)
2. **Mount path** olarak şunu yazın:

   ```
   /data
   ```

3. Kaydedin

---

## 3. Ortam değişkenlerini girin

Servis → **Variables** sekmesi → aşağıdakileri tek tek ekleyin:

| Değişken | Değer | Açıklama |
| --- | --- | --- |
| `MELEK_ADMIN_PASSWORD` | *(panel şifreniz)* | Yönetici paneli şifresi |
| `MELEK_DB` | `/data/melek.db` | Veritabanını kalıcı diske yazar |
| `MELEK_SECURE_COOKIES` | `1` | Railway HTTPS sunar, çerezler korunur |

> **`PORT` değişkenini elle EKLEMEYİN.** Railway bunu kendisi verir;
> elle eklerseniz uygulama açılmaz.

Değişkenleri kaydettiğinizde Railway otomatik olarak yeniden dağıtır.

---

## 4. Adresi alın

1. Servis → **Settings** → **Networking**
2. **Generate Domain** düğmesine basın
3. Size `xxx.up.railway.app` biçiminde bir adres verilir

Bu adres artık salonunuzun randevu sayfasıdır:

| Sayfa | Adres |
| --- | --- |
| Müşteri randevu sayfası | `https://xxx.up.railway.app` |
| Yönetici paneli | `https://xxx.up.railway.app/admin/` |

---

## 5. Çalıştığını doğrulayın

Tarayıcıda şu adresi açın:

```
https://xxx.up.railway.app/api/health
```

Şunu görmelisiniz:

```json
{"ok":true,"mode":"api","version":1}
```

`"mode":"api"` yazıyorsa backend çalışıyor demektir. Ardından:

1. Randevu sayfasından bir test randevusu oluşturun
2. `/admin/` adresine gidip şifrenizle girin, randevuyu görün
3. Randevuyu silin

**Kalıcılık testi (atlamayın):** Railway panelinden **Redeploy** edin.
Yeniden dağıtım bitince panele tekrar girin; randevularınız duruyorsa
kalıcı disk doğru kurulmuş demektir. Duruyorsa tamam, silinmişse
2. adıma dönün.

---

## Kendi alan adınızı bağlamak

Salonunuzun alan adı varsa (örn. `melekguzellik.com`):

1. Servis → **Settings** → **Networking** → **Custom Domain**
2. Railway size bir CNAME kaydı verir
3. Alan adınızı aldığınız firmanın paneline bu kaydı girin

HTTPS sertifikası Railway tarafından otomatik alınır.

---

## Güncelleme yapmak

Depoya yeni bir commit gönderildiğinde Railway otomatik olarak yeni
sürümü yayına alır. Kalıcı disk kurulduysa randevular korunur.

---

## Yedekleme

Kalıcı disk tek başına yedek değildir. Düzenli olarak yönetici
panelinden **Yedekleme ve Dışa Aktarma → Yedek İndir (JSON)** ile
kayıtlarınızı bilgisayarınıza indirin.

---

## Sorun giderme

**Uygulama açılmıyor / "Application failed to respond"**
Servis → **Deployments** → son dağıtıma tıklayıp günlüklere bakın.
Sık görülen sebep: `PORT` değişkeninin elle eklenmiş olması. Silin.

**"Bu uygulama Node.js 22.5 veya üstünü gerektirir"**
`.nvmrc` dosyası depoda yok veya içeriği `22` değil. Kontrol edin.

**Randevular her güncellemede siliniyor**
Kalıcı disk eklenmemiş ya da `MELEK_DB` değişkeni `/data/melek.db`
değerine ayarlanmamış. 2. ve 3. adımları tekrar edin.

**Panele giremiyorum**
`MELEK_ADMIN_PASSWORD` değişkenini kontrol edin. Şifre büyük/küçük harf
ve Türkçe karakter duyarlıdır. Değişkeni değiştirdikten sonra Railway'in
yeniden dağıtımı bitirmesini bekleyin.

**Ücretlendirme**
Railway'in ücretsiz deneme kredisi sınırlıdır; kredi bitince servis
durur. Güncel plan ve fiyatları Railway panelinizdeki **Usage** ve
**Billing** bölümlerinden takip edin. Kalıcı disk kullanımı da bu
kotaya dahildir.
