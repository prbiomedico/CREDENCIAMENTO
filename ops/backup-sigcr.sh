#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_root=/opt/sigcr-backups/daily
install -d -m 700 "$backup_root"
exec 9>/run/lock/sigcr-backup.lock
flock -n 9 || exit 0
free_kb=$(df -Pk "$backup_root" | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt 2097152 ]; then
  echo 'Backup abortado: menos de 2 GiB livres.' >&2
  exit 1
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
partial="$backup_root/.partial-$stamp"
final="$backup_root/$stamp"
mkdir "$partial"
trap 'echo "Backup incompleto preservado em $partial" >&2' ERR
# Dump completo inclui as contas Mongo, além dos bancos de aplicação.
docker exec sigcr-mongodb sh -c 'exec mongodump --archive --gzip --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$partial/mongodb.archive.gz" 2> "$partial/mongodb-dump.log"
docker exec sigcr-keycloak-db sh -c 'exec pg_dumpall -U "$POSTGRES_USER"' | gzip > "$partial/keycloak-postgresql.sql.gz"
tar -czf "$partial/uploads.tar.gz" -C /opt/sigcr/backend uploads
tar -czf "$partial/runtime-config.tar.gz" -C / etc/nginx -C /opt/sigcr backend/.env frontend/.env.production
for dir in /opt/sigcr/keycloak /opt/keycloak/themes/sigcr; do
  if [ -d "$dir" ]; then tar -czf "$partial/keycloak-theme.tar.gz" -C "$dir" .; break; fi
done
for archive in "$partial"/*.gz; do gzip -t "$archive"; done
(cd "$partial" && sha256sum *.gz > SHA256SUMS)
git -C /opt/sigcr rev-parse HEAD > "$partial/commit.txt"
readlink -f /opt/sigcr/frontend/current > "$partial/frontend-release.txt"
date -u +%FT%TZ > "$partial/completed-at.txt"
mv "$partial" "$final"
echo "Backup concluído: $final"
# Retenção não apaga cópias até existir uma política de retenção externa definida.
