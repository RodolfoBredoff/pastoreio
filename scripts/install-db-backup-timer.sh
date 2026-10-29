#!/usr/bin/env bash
# =============================================================================
# install-db-backup-timer.sh
#
# Rodar NA EC2 (sudo). Instala o backup diário do PostgreSQL para o S3:
#   - /usr/local/bin/pastoreio-db-backup.sh  (pg_dump dentro do container → S3)
#   - pastoreio-db-backup.service + .timer   (todo dia às 10:45, horário de Brasília,
#     antes do desligamento das 11:00; Persistent=true roda no boot se o horário
#     foi perdido com a instância desligada)
#
# Destino: s3://<bucket>/db-backups/pastoreio/pastoreio_<AAAAMMDD-HHMMSS>Z.dump
#          (formato custom do pg_dump: comprimido, restaurável com pg_restore)
# Retenção: 30 dias (o próprio script apaga os mais antigos, só depois de um
#           upload bem-sucedido e mantendo sempre pelo menos 7 arquivos).
#
# Uso:      sudo bash scripts/install-db-backup-timer.sh [--app-dir /opt/pequenos-grupos]
# Rodar já: sudo systemctl start pastoreio-db-backup.service
# Log:      journalctl -u pastoreio-db-backup.service -n 30 --no-pager
# Remover:  sudo systemctl disable --now pastoreio-db-backup.timer &&
#           sudo rm /etc/systemd/system/pastoreio-db-backup.{service,timer} \
#                   /usr/local/bin/pastoreio-db-backup.sh && sudo systemctl daemon-reload
#
# Restauração: docs/BACKUP_BANCO.md
# =============================================================================
set -euo pipefail

APP_DIR="/opt/pequenos-grupos"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then echo "Rode com sudo." >&2; exit 1; fi
[[ -f "$APP_DIR/.env" ]] || { echo "$APP_DIR/.env não encontrado" >&2; exit 1; }
command -v aws >/dev/null || { echo "AWS CLI não encontrado" >&2; exit 1; }
command -v flock >/dev/null || { echo "flock não encontrado" >&2; exit 1; }

cat > /usr/local/bin/pastoreio-db-backup.sh <<EOF
#!/usr/bin/env bash
# Backup diário do PostgreSQL do Pastoreio para o S3 (instalado por install-db-backup-timer.sh).
set -euo pipefail
exec 9>/var/lock/pastoreio-db-backup.lock
flock -n 9 || { echo "outro backup em andamento"; exit 0; }

APP_DIR="$APP_DIR"
EOF

cat >> /usr/local/bin/pastoreio-db-backup.sh <<'EOF'
CONTAINER="pequenos-grupos-postgres"
PREFIX="db-backups/pastoreio"
RETENTION_DAYS=30
MIN_KEEP=7

envval() { grep -E "^$1=" "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
DB_USER="$(envval DATABASE_USER)"; DB_USER="${DB_USER:-postgres}"
DB_NAME="$(envval DATABASE_NAME)"; DB_NAME="${DB_NAME:-pequenos_grupos}"
BUCKET="$(envval INVITE_COVERS_BUCKET)"; BUCKET="${BUCKET:-$(envval S3_BUCKET)}"
REGION="$(envval AWS_REGION)"; REGION="${REGION:-us-east-1}"
[[ -n "$BUCKET" ]] || { echo "ERRO: bucket não configurado no .env" >&2; exit 1; }

STAMP="$(date -u +%Y%m%d-%H%M%S)Z"
KEY="$PREFIX/pastoreio_${STAMP}.dump"
TMP="$(mktemp /var/tmp/pastoreio-backup.XXXXXX)"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT

# 1. Dump dentro do container (o Postgres não publica porta no host)
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$TMP"

# 2. Verificação: arquivo não vazio e legível pelo pg_restore
SIZE=$(stat -c %s "$TMP")
[[ "$SIZE" -gt 1024 ]] || { echo "ERRO: dump muito pequeno ($SIZE bytes)" >&2; exit 1; }
TABLES=$(docker exec -i "$CONTAINER" pg_restore --list < "$TMP" | grep -c " TABLE DATA " || true)
[[ "$TABLES" -gt 0 ]] || { echo "ERRO: dump sem dados de tabelas" >&2; exit 1; }

# 3. Upload (criptografado no S3)
aws s3 cp "$TMP" "s3://$BUCKET/$KEY" --region "$REGION" --sse AES256 --only-show-errors

# 4. Retenção: só depois do upload, mantendo sempre os MIN_KEEP mais recentes.
#    A data vem do nome do arquivo (pastoreio_AAAAMMDD-...), comparada como texto.
CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d)"
mapfile -t OLD < <(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/pastoreio_" --region "$REGION" \
  --query "Contents[].Key" --output text | tr '\t' '\n' | grep -E '/pastoreio_[0-9]{8}-[0-9]{6}Z\.dump$' \
  | sort | head -n -"$MIN_KEEP" \
  | awk -v c="$CUTOFF" '{ d = substr($0, index($0, "pastoreio_") + 10, 8); if (d < c) print }' || true)
for k in "${OLD[@]}"; do
  aws s3 rm "s3://$BUCKET/$k" --region "$REGION" --only-show-errors
done

TOTAL=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/pastoreio_" --region "$REGION" \
  --query "length(Contents || \`[]\`)" --output text)
echo "{\"ok\":true,\"key\":\"$KEY\",\"bytes\":$SIZE,\"tables_with_data\":$TABLES,\"removed\":${#OLD[@]},\"total_backups\":$TOTAL}"
EOF
chmod 700 /usr/local/bin/pastoreio-db-backup.sh

cat > /etc/systemd/system/pastoreio-db-backup.service <<'EOF'
[Unit]
Description=Backup diario do PostgreSQL do Pastoreio para o S3
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pastoreio-db-backup.sh
Nice=10
IOSchedulingClass=idle
EOF

cat > /etc/systemd/system/pastoreio-db-backup.timer <<'EOF'
[Unit]
Description=Backup do banco todo dia as 10:45 (Brasilia) e no boot se o horario foi perdido

[Timer]
OnCalendar=*-*-* 10:45:00 America/Sao_Paulo
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now pastoreio-db-backup.timer
systemctl list-timers pastoreio-db-backup.timer --no-pager
echo
echo "Instalado. Rodar agora: sudo systemctl start pastoreio-db-backup.service"
echo "Ver resultado:          journalctl -u pastoreio-db-backup.service -n 30 --no-pager"
