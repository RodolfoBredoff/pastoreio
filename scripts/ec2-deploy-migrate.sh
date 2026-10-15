#!/usr/bin/env bash
# Aplica migrations SQL no PostgreSQL em execução na EC2 (container Docker).
# Uso: bash scripts/ec2-deploy-migrate.sh [arquivo.sql ...]
#   Sem argumentos: aplica a migration 031 (campos adicionais da lista de presença).
# As migrations do projeto são idempotentes (IF NOT EXISTS), seguras para reexecução.
set -u

cd "$(dirname "$0")/.." || { echo "Repo não encontrado"; exit 1; }

PG_CONTAINER="${PG_CONTAINER:-pequenos-grupos-postgres}"

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${PG_CONTAINER}$"; then
  echo "ERRO: container ${PG_CONTAINER} não está rodando."
  docker ps --format '{{.Names}}' 2>/dev/null || true
  exit 1
fi

FILES=("$@")
if [ ${#FILES[@]} -eq 0 ] || [ -z "${FILES[0]}" ]; then
  FILES=(db/migrations/031_attendance_list_extra_fields.sql)
fi

FAILED=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERRO: arquivo não encontrado: $f"
    FAILED=1
    continue
  fi
  echo "== Aplicando $f =="
  if cat "$f" | docker exec -i "$PG_CONTAINER" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
    echo "== OK: $f =="
  else
    echo "== FALHOU: $f =="
    FAILED=1
  fi
done

# Verificação rápida: tabela dos campos adicionais deve existir
echo "== Verificação: attendance_list_extra_fields =="
ROWS=$(docker exec "$PG_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "\dt attendance_list_extra_fields"' 2>/dev/null | wc -l)
if [ "${ROWS:-0}" -ge 1 ]; then
  echo "OK: tabela attendance_list_extra_fields existe"
else
  echo "AVISO: tabela attendance_list_extra_fields não encontrada"
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi
echo "Migrations aplicadas com sucesso."
