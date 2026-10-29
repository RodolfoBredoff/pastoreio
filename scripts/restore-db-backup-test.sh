#!/usr/bin/env bash
# =============================================================================
# restore-db-backup-test.sh
#
# Rodar NA EC2 (sudo). Testa um backup sem tocar na produção:
# baixa o dump do S3, restaura num container PostgreSQL temporário e compara a
# quantidade de linhas das tabelas principais com o banco de produção.
#
# Uso: sudo bash scripts/restore-db-backup-test.sh [chave-no-s3]
#      (sem argumento: usa o backup mais recente de db-backups/pastoreio/)
# =============================================================================
set -euo pipefail

APP_DIR="/opt/pequenos-grupos"
PREFIX="db-backups/pastoreio"
PROD="pequenos-grupos-postgres"
TEST="pastoreio-restore-test"
TABLES="users leaders groups members meetings attendance attendance_list_public_entries attendance_list_responses notifications"

envval() { grep -E "^$1=" "$APP_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
DB_USER="$(envval DATABASE_USER)"; DB_USER="${DB_USER:-postgres}"
DB_NAME="$(envval DATABASE_NAME)"; DB_NAME="${DB_NAME:-pequenos_grupos}"
BUCKET="$(envval INVITE_COVERS_BUCKET)"; BUCKET="${BUCKET:-$(envval S3_BUCKET)}"
REGION="$(envval AWS_REGION)"; REGION="${REGION:-us-east-1}"

KEY="${1:-$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX/" --region "$REGION" \
  --query 'sort_by(Contents, &LastModified)[-1].Key' --output text)}"
[[ -n "$KEY" && "$KEY" != "None" ]] || { echo "Nenhum backup encontrado" >&2; exit 1; }

TMP="$(mktemp /var/tmp/pastoreio-restore.XXXXXX)"; chmod 600 "$TMP"
cleanup() { docker rm -f "$TEST" >/dev/null 2>&1 || true; rm -f "$TMP"; }
trap cleanup EXIT

echo "Backup: s3://$BUCKET/$KEY"
aws s3 cp "s3://$BUCKET/$KEY" "$TMP" --region "$REGION" --only-show-errors

docker run -d --rm --name "$TEST" --memory 256m -e POSTGRES_PASSWORD=restore-test \
  -e POSTGRES_DB="$DB_NAME" postgres:15-alpine >/dev/null
for _ in $(seq 1 30); do docker exec "$TEST" pg_isready -U postgres -q && break; sleep 1; done

docker exec -i "$TEST" pg_restore -U postgres -d "$DB_NAME" --no-owner --exit-on-error < "$TMP"

count() { docker exec "$1" psql -U "$2" -d "$DB_NAME" -At -c "SELECT count(*) FROM $3" 2>/dev/null || echo "-"; }
printf "%-34s %10s %10s\n" "tabela" "backup" "produção"
DIFF=0
for t in $TABLES; do
  b=$(count "$TEST" postgres "$t"); p=$(count "$PROD" "$DB_USER" "$t")
  [[ "$b" == "$p" ]] || DIFF=$((DIFF+1))
  printf "%-34s %10s %10s\n" "$t" "$b" "$p"
done
echo
if [[ $DIFF -eq 0 ]]; then echo "OK: backup restaurado e contagens iguais às da produção."
else echo "ATENÇÃO: $DIFF tabela(s) com contagem diferente (normal se houve uso do app depois do backup)."; fi
