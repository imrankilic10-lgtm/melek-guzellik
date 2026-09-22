#!/usr/bin/env bash
#
# Melek Güzellik Salonu — ücretsiz sunucu kurulum betiği
#
# Yeni kurulmuş bir Ubuntu sunucuda çalıştırılır. Şunları yapar:
#   - Node.js 22 kurar
#   - Projeyi indirir
#   - Yönetici şifresini ayarlar
#   - Sistemi açılışta başlayacak servis haline getirir
#   - Caddy ile ücretsiz HTTPS sertifikası alır
#   - Güvenlik duvarını açar (Oracle Cloud dahil)
#
# Kullanım:
#   sudo bash kurulum.sh
#
set -euo pipefail

REPO_URL="${MELEK_REPO:-https://github.com/imrankilic10-lgtm/melek-guzellik.git}"
APP_DIR="/var/www/melek-guzellik"
APP_USER="melek"
ENV_FILE="/etc/melek.env"
PASS_FILE="/etc/melek-sifre"

kirmizi() { printf '\033[0;31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[0;32m%s\033[0m\n' "$*"; }
mavi()    { printf '\033[0;34m%s\033[0m\n' "$*"; }
baslik()  { echo; mavi "▶ $*"; }

if [ "$(id -u)" -ne 0 ]; then
  kirmizi "Bu betik root yetkisiyle çalışmalı:  sudo bash kurulum.sh"
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  kirmizi "Bu betik Ubuntu/Debian içindir. Sunucunuzu Ubuntu olarak kurun."
  exit 1
fi

# ---------------------------------------------------------------- bilgiler
echo
mavi "═══════════════════════════════════════════════"
mavi "  Melek Güzellik Salonu — Sunucu Kurulumu"
mavi "═══════════════════════════════════════════════"
echo

if [ -z "${MELEK_DOMAIN:-}" ]; then
  echo "Sitenizin alan adını girin."
  echo "Ücretsiz bir adres için önce duckdns.org'dan alın, örn: melekguzellik.duckdns.org"
  echo
  read -r -p "Alan adı: " MELEK_DOMAIN
fi

if [ -z "${MELEK_DOMAIN}" ]; then
  kirmizi "Alan adı boş olamaz."
  exit 1
fi

if [ -z "${MELEK_ADMIN_PASSWORD:-}" ]; then
  echo
  echo "Yönetici paneli şifresini girin (yazarken görünmez)."
  read -r -s -p "Şifre: " MELEK_ADMIN_PASSWORD
  echo
fi

if [ -z "${MELEK_ADMIN_PASSWORD}" ]; then
  kirmizi "Şifre boş olamaz."
  exit 1
fi

# ---------------------------------------------------------------- paketler
baslik "Sistem paketleri güncelleniyor"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git sqlite3 >/dev/null

# ---------------------------------------------------------------- Node.js
baslik "Node.js kuruluyor"
NODE_OK=0
if command -v node >/dev/null 2>&1; then
  MEVCUT="$(node -p 'process.versions.node.split(".").slice(0,2).map(Number).join(".")' 2>/dev/null || echo 0)"
  MAJOR="${MEVCUT%%.*}"; MINOR="${MEVCUT##*.}"
  if [ "${MAJOR:-0}" -gt 22 ] || { [ "${MAJOR:-0}" -eq 22 ] && [ "${MINOR:-0}" -ge 5 ]; }; then
    NODE_OK=1
    echo "  Uygun sürüm zaten kurulu: $(node --version)"
  fi
fi

if [ "$NODE_OK" -eq 0 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
  echo "  Kuruldu: $(node --version)"
fi

# node:sqlite gerçekten var mı?
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  kirmizi "Node.js sürümü yetersiz ($(node --version)). 22.5 veya üstü gerekir."
  exit 1
fi

# ---------------------------------------------------------------- uygulama
baslik "Proje indiriliyor"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

if [ -d "$APP_DIR/.git" ]; then
  echo "  Mevcut kurulum güncelleniyor"
  git -C "$APP_DIR" fetch --quiet origin
  DAL="$(git -C "$APP_DIR" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || true)"
  if [ -z "$DAL" ]; then
    DAL="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
  fi
  git -C "$APP_DIR" reset --quiet --hard "origin/${DAL}"
else
  mkdir -p "$(dirname "$APP_DIR")"
  rm -rf "$APP_DIR"
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------- ayarlar
baslik "Ayarlar yazılıyor"

umask 077

# Şifre ham haliyle kendi dosyasına yazılır: hiçbir kaçışlama gerekmez,
# $ " \ # boşluk gibi karakterler olduğu gibi çalışır.
printf '%s' "$MELEK_ADMIN_PASSWORD" > "$PASS_FILE"
chmod 640 "$PASS_FILE"
chown root:"$APP_USER" "$PASS_FILE"

cat > "$ENV_FILE" <<ENVEOF
# Melek Güzellik Salonu — sunucu ayarları
# Şifre burada değil, ${PASS_FILE} dosyasındadır.
MELEK_ADMIN_PASSWORD_FILE=${PASS_FILE}
MELEK_DB=${APP_DIR}/data/melek.db
MELEK_SECURE_COOKIES=1
PORT=3000
ENVEOF
chmod 600 "$ENV_FILE"
umask 022
echo "  $ENV_FILE"
echo "  $PASS_FILE (şifre — yalnızca root ve servis okuyabilir)"

# ---------------------------------------------------------------- servis
baslik "Servis kuruluyor"
cat > /etc/systemd/system/melek.service <<SERVICEEOF
[Unit]
Description=Melek Guzellik Salonu randevu sunucusu
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/server.js
EnvironmentFile=${ENV_FILE}
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable --quiet melek
systemctl restart melek

sleep 3
if ! systemctl is-active --quiet melek; then
  kirmizi "Servis başlatılamadı. Günlükler:"
  journalctl -u melek -n 30 --no-pager
  exit 1
fi
yesil "  Servis çalışıyor"

# ---------------------------------------------------------------- Caddy
baslik "HTTPS kuruluyor (Caddy)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

cat > /etc/caddy/Caddyfile <<CADDYEOF
# Sertifika otomatik alınır ve yenilenir.
${MELEK_DOMAIN} {
    reverse_proxy 127.0.0.1:3000
    encode gzip
}
CADDYEOF

systemctl restart caddy
yesil "  Caddy çalışıyor"

# ---------------------------------------------------------------- güvenlik duvarı
baslik "Güvenlik duvarı ayarlanıyor"

if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp  >/dev/null 2>&1 || true
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

# Oracle Cloud imajlarında iptables varsayılan olarak 80/443'ü kapatır
if command -v iptables >/dev/null 2>&1; then
  for PORT in 80 443; do
    if ! iptables -C INPUT -p tcp --dport "$PORT" -j ACCEPT >/dev/null 2>&1; then
      iptables -I INPUT 1 -p tcp --dport "$PORT" -j ACCEPT
    fi
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null 2>&1 || true
  else
    apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
    netfilter-persistent save >/dev/null 2>&1 || true
  fi
  echo "  80 ve 443 portları açıldı"
fi

# ---------------------------------------------------------------- yedekleme
baslik "Günlük yedekleme kuruluyor"
install -m 755 "$APP_DIR/deploy/yedekle.sh" /usr/local/bin/melek-yedekle
mkdir -p /var/backups/melek
cat > /etc/cron.d/melek-yedek <<CRONEOF
# Melek Güzellik Salonu — her gece 03:00'te yedek
0 3 * * * root MELEK_DB=${APP_DIR}/data/melek.db /usr/local/bin/melek-yedekle >/dev/null 2>&1
CRONEOF
echo "  Her gece 03:00 → /var/backups/melek"

# ---------------------------------------------------------------- kontrol
baslik "Kontrol ediliyor"
sleep 2
SAGLIK="$(curl -s --max-time 5 http://127.0.0.1:3000/api/health || echo '')"
if echo "$SAGLIK" | grep -q '"mode":"api"'; then
  yesil "  Uygulama yanıt veriyor"
else
  kirmizi "  Uygulama yanıt vermedi. Günlükler: journalctl -u melek -n 30"
fi

IP="$(curl -s --max-time 5 https://api.ipify.org || echo 'sunucu-ip')"

echo
mavi "═══════════════════════════════════════════════"
yesil "  Kurulum tamamlandı"
mavi "═══════════════════════════════════════════════"
echo
echo "  Randevu sayfası : https://${MELEK_DOMAIN}"
echo "  Yönetici paneli : https://${MELEK_DOMAIN}/admin/"
echo
echo "  Sunucu IP       : ${IP}"
echo "  Veritabanı      : ${APP_DIR}/data/melek.db"
echo "  Yedekler        : /var/backups/melek"
echo
echo "  Alan adınızın DNS kaydı ${IP} adresini göstermiyorsa"
echo "  HTTPS sertifikası alınamaz. DuckDNS panelinden kontrol edin."
echo
echo "  Faydalı komutlar:"
echo "    sudo systemctl status melek      → durum"
echo "    sudo journalctl -u melek -f      → canlı günlük"
echo "    sudo systemctl restart melek     → yeniden başlat"
echo "    sudo bash ${APP_DIR}/deploy/kurulum.sh  → güncelle"
echo
