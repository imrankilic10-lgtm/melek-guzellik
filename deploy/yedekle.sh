#!/bin/sh
# Veritabanının günlük yedeğini alır ve 30 günden eskileri siler.
#
# Kurulum (her gece 03:00):
#   crontab -e
#   0 3 * * * /var/www/melek-guzellik/deploy/yedekle.sh

set -eu

DB="${MELEK_DB:-/var/www/melek-guzellik/data/melek.db}"
HEDEF="${MELEK_BACKUP_DIR:-/var/backups/melek}"
TARIH="$(date +%Y-%m-%d)"

mkdir -p "$HEDEF"

# SQLite'in kendi yedekleme komutu: kullanımdayken de güvenli kopyalar
sqlite3 "$DB" ".backup '$HEDEF/melek-$TARIH.db'"

# 30 günden eski yedekleri temizle
find "$HEDEF" -name 'melek-*.db' -mtime +30 -delete

echo "Yedek alındı: $HEDEF/melek-$TARIH.db"
