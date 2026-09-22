# Ücretsiz Sunucuya Kurulum

Bu rehber sistemi **tamamen ücretsiz**, 7/24 açık kalan bir sunucuda
yayına almanızı sağlar. Aylık ödeme yoktur.

Toplam süre: yaklaşık 30–45 dakika. Teknik bilgi gerekmez; komutlar
kopyala-yapıştır olarak verilmiştir.

**Yapacaklarınız:**

1. Ücretsiz sunucu açmak (Oracle Cloud)
2. Ücretsiz adres almak (DuckDNS)
3. Tek komutla kurulum

---

## Önce bilinmesi gerekenler

**Kredi kartı isteniyor mu?** Evet, Oracle hesap açarken kimlik
doğrulaması için kart bilgisi ister. **Ücret çekilmez.** "Always Free"
kaynaklar süresiz ücretsizdir ve hesabınız ücretli plana kendiliğinden
geçmez. İstemezseniz Oracle yerine Google Cloud'un ücretsiz sunucusunu
da kullanabilirsiniz (aşağıda).

**Neden alan adı gerekiyor?** HTTPS (yeşil kilit) sertifikası yalnızca
alan adına verilir, IP adresine verilmez. Panelden müşteri adı ve
telefonu geçtiği için HTTPS şarttır. DuckDNS ücretsiz alan adı verir.

---

## 1. Ücretsiz sunucu açın (Oracle Cloud)

1. [cloud.oracle.com](https://cloud.oracle.com) → **Start for free**
2. Ülke olarak Türkiye, bölge olarak size yakın bir bölge seçin
   (örn. Frankfurt veya Amsterdam)
3. Hesap doğrulamasını tamamlayın
4. Panelde **Compute → Instances → Create Instance**
5. Ayarlar:
   - **Image:** Ubuntu 24.04 (veya 22.04)
   - **Shape:** **Always Free** etiketli olanlardan birini seçin
     (`VM.Standard.A1.Flex` veya `VM.Standard.E2.1.Micro`)
   - **SSH keys:** **Save private key** ile anahtar dosyasını
     bilgisayarınıza indirin — bu dosya olmadan sunucuya giremezsiniz
6. **Create** deyin ve sunucunun **Public IP** adresini not edin

### Portları açın (atlanırsa site açılmaz)

Oracle varsayılan olarak web trafiğini kapalı tutar:

1. Instance sayfasında **Subnet** bağlantısına tıklayın
2. **Security Lists** → listeye tıklayın
3. **Add Ingress Rules** ile iki kural ekleyin:

| Source CIDR | IP Protocol | Destination Port |
| --- | --- | --- |
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

> Kurulum betiği sunucunun kendi içindeki güvenlik duvarını ayrıca
> açar; bu adım Oracle'ın dış katmanı içindir, ikisi de gereklidir.

---

## 2. Ücretsiz adres alın (DuckDNS)

1. [duckdns.org](https://www.duckdns.org) → Google/GitHub ile giriş yapın
2. İstediğiniz adı yazıp **add domain** deyin,
   örn. `melekguzellik` → `melekguzellik.duckdns.org`
3. **current ip** kutusuna sunucunuzun **Public IP** adresini yazıp
   **update ip** deyin

Adresin doğru yönlendiğini kontrol edin (bilgisayarınızın terminalinde):

```bash
ping melekguzellik.duckdns.org
```

Sunucunuzun IP'sini gösteriyorsa devam edin. Göstermiyorsa birkaç dakika
bekleyip tekrar deneyin.

---

## 3. Sunucuya bağlanın

İndirdiğiniz anahtar dosyasının bulunduğu klasörde terminal açın:

```bash
chmod 600 anahtar.key
ssh -i anahtar.key ubuntu@SUNUCU-IP-ADRESI
```

> Windows kullanıyorsanız: PowerShell aynı komutu çalıştırır.

---

## 4. Tek komutla kurun

Sunucuya bağlandıktan sonra şunu yapıştırın:

```bash
curl -fsSL https://raw.githubusercontent.com/imrankilic10-lgtm/melek-guzellik/HEAD/deploy/kurulum.sh -o kurulum.sh
sudo bash kurulum.sh
```

Betik sırasıyla soracak:

- **Alan adı:** `melekguzellik.duckdns.org`
- **Şifre:** yönetici paneli şifreniz (yazarken görünmez)

Sonra her şeyi kendisi yapar: Node.js kurulumu, projenin indirilmesi,
servis tanımı, ücretsiz HTTPS sertifikası, güvenlik duvarı ve günlük
otomatik yedekleme.

Bitince ekranda adresiniz yazar:

```
Randevu sayfası : https://melekguzellik.duckdns.org
Yönetici paneli : https://melekguzellik.duckdns.org/admin/
```

---

## 5. Çalıştığını doğrulayın

1. Tarayıcıda `https://alanadiniz.duckdns.org/api/health` açın →
   `{"ok":true,"mode":"api","version":1}` görmelisiniz
2. Randevu sayfasından test randevusu oluşturun
3. `/admin/` adresine girip randevuyu görün, sonra silin
4. Adres çubuğunda kilit simgesi olduğunu kontrol edin

---

## Google Cloud alternatifi

Oracle yerine Google Cloud'un **Always Free** sunucusunu da
kullanabilirsiniz (aynı şekilde süresiz ücretsizdir):

1. [console.cloud.google.com](https://console.cloud.google.com) →
   **Compute Engine → VM instances → Create instance**
2. **Region:** `us-west1`, `us-central1` veya `us-east1`
   (ücretsiz katman yalnızca bu bölgelerde geçerlidir)
3. **Machine type:** `e2-micro`
4. **Boot disk:** Ubuntu 24.04, 30 GB standart disk
5. **Firewall:** *Allow HTTP traffic* ve *Allow HTTPS traffic* işaretleyin
6. Oluşturun, **External IP** adresini DuckDNS'e girin
7. Tarayıcıdaki **SSH** düğmesiyle bağlanıp 4. adımdaki komutu çalıştırın

> Türkiye'den erişimde Google'ın ücretsiz bölgeleri ABD'de olduğu için
> sayfa açılışı Oracle'ın Frankfurt bölgesine göre biraz daha yavaş olur.

---

## Günlük kullanım

**Sistemi güncellemek** (yeni özellikler geldiğinde):

```bash
sudo bash /var/www/melek-guzellik/deploy/kurulum.sh
```

Randevularınız korunur.

**Şifreyi değiştirmek:**

```bash
sudo nano /etc/melek-sifre      # içeriği silip yeni şifreyi yazın
sudo systemctl restart melek
```

> Dosyaya satır sonu eklemeyin. `nano` ile kaydederken dosyanın sonunda
> boş satır bırakmayın (Ctrl+O, Enter, Ctrl+X).

**Durum ve günlükler:**

```bash
sudo systemctl status melek      # çalışıyor mu
sudo journalctl -u melek -f      # canlı günlük (çıkmak için Ctrl+C)
sudo systemctl restart melek     # yeniden başlat
```

**Yedekler:** Her gece 03:00'te otomatik alınır, `/var/backups/melek`
altında 30 gün saklanır. Ayrıca panelden **Yedek İndir (JSON)** ile
kendi bilgisayarınıza da indirin — sunucunun kendisi bozulursa bu işe yarar.

---

## Sorun giderme

**Site açılmıyor**
Oracle Security List'te 80 ve 443 portlarını açtığınızdan emin olun
(1. adımın sonu). En sık atlanan adım budur.

**"Sertifika alınamadı" / kilit simgesi yok**
DuckDNS adresi sunucunun IP'sini göstermiyordur. `ping alanadiniz.duckdns.org`
ile kontrol edin, düzeltip `sudo systemctl restart caddy` deyin.

**Panele giremiyorum**
Şifre dosyasında fazladan satır sonu olabilir:

```bash
sudo bash -c 'printf "%s" "yeni-sifreniz" > /etc/melek-sifre'
sudo systemctl restart melek
```

**Uygulama çalışmıyor**
`sudo journalctl -u melek -n 50` ile son 50 satır günlüğe bakın.

**Sunucu kapandı / IP değişti**
Oracle'da instance'ı yeniden başlatınca IP genelde değişmez. Değiştiyse
DuckDNS'teki IP'yi güncelleyin.
