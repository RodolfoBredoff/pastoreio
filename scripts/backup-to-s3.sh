#!/bin/bash
# =============================================================================
# backup-to-s3.sh — Backup automático do PostgreSQL para o Amazon S3
# =============================================================================
# Uso: ./backup-to-s3.sh
# Recomendação: agendar via crontab na EC2 (ex: diário às 03:00)
#
# Variáveis de ambiente necessárias (ou configurar abaixo):
#   DB_NAME, DB_USER, DB_HOST, DB_PORT, S3_BUCKET, AWS_REGION
#   BACKUP_RETENTION_DAYS (padrão: 30)
# =============================================================================

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
DB_NAME="${DB_NAME:-pequenos_grupos}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
S3_BUCKET="${S3_BUCKET:-}"          # Ex: meu-bucket-backups
S3_PREFIX="${S3_PREFIX:-db-backups/pequenos-grupos}"
AWS_REGION="${AWS_REGION:-us-east-1}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_DIR="/tmp/pg-backups"

# ── Validação ─────────────────────────────────────────────────────────────────
if [[ -z "$S3_BUCKET" ]]; then
  echo "[backup] ERRO: variável S3_BUCKET não definida."
  exit 1
fi

if ! command -v pg_dump &>/dev/null; then
  echo "[backup] ERRO: pg_dump não encontrado. Instale o cliente PostgreSQL."
  exit 1
fi

if ! command -v aws &>/dev/null; then
  echo "[backup] ERRO: AWS CLI não encontrada. Instale com: sudo apt-get install awscli"
  exit 1
fi

# ── Backup ────────────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[backup] Iniciando backup de '${DB_NAME}' em ${TIMESTAMP}..."

PGPASSWORD="${DB_PASSWORD:-}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_FILE"

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[backup] Backup gerado: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Upload para S3 ────────────────────────────────────────────────────────────
S3_KEY="${S3_PREFIX}/${DB_NAME}_${TIMESTAMP}.sql.gz"

aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_KEY}" \
  --region "$AWS_REGION" \
  --storage-class STANDARD_IA

echo "[backup] Upload concluído: s3://${S3_BUCKET}/${S3_KEY}"

# ── Limpeza local ─────────────────────────────────────────────────────────────
rm -f "$BACKUP_FILE"
echo "[backup] Arquivo local removido."

# ── Limpeza de backups antigos no S3 ─────────────────────────────────────────
echo "[backup] Removendo backups com mais de ${BACKUP_RETENTION_DAYS} dias no S3..."

CUTOFF_DATE=$(date -d "${BACKUP_RETENTION_DAYS} days ago" +"%Y-%m-%dT%H:%M:%S" 2>/dev/null \
  || date -v -"${BACKUP_RETENTION_DAYS}"d +"%Y-%m-%dT%H:%M:%S")

aws s3api list-objects-v2 \
  --bucket "$S3_BUCKET" \
  --prefix "${S3_PREFIX}/" \
  --region "$AWS_REGION" \
  --query "Contents[?LastModified<='${CUTOFF_DATE}'].Key" \
  --output text \
  | tr '\t' '\n' \
  | while read -r key; do
      if [[ -n "$key" && "$key" != "None" ]]; then
        aws s3 rm "s3://${S3_BUCKET}/${key}" --region "$AWS_REGION"
        echo "[backup] Removido: s3://${S3_BUCKET}/${key}"
      fi
    done

echo "[backup] Backup concluído com sucesso em $(date)."
