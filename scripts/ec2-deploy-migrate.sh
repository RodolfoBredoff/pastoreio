#!/usr/bin/env bash
# =============================================================================
# ec2-deploy-migrate.sh
#
# Aplica no PostgreSQL (container Docker da EC2) SOMENTE as migrations de
# db/migrations/*.sql que ainda não foram aplicadas, registrando cada uma na
# tabela schema_migrations.
#
#   - Cada migration roda em UMA transação, junto com o seu registro: ou entra
#     inteira e é registrada, ou nada é gravado. Em caso de erro o script para
#     (as seguintes dependem das anteriores) e sai com código 1.
#   - Migration já registrada nunca é executada de novo. Isso importa: várias
#     migrations antigas têm UPDATE/DELETE e NÃO são seguras para repetir
#     (ex.: 004 altera datas de nascimento; 017 apaga presenças).
#   - Primeira execução em um banco que já existe (sem schema_migrations):
#     registra como aplicadas (sem executar) as migrations até BASELINE_LAST.
#     Em um banco vazio, cria a tabela e aplica tudo.
#   - Se o arquivo de uma migration já aplicada mudou, apenas avisa (não reexecuta).
#
# Uso:  bash scripts/ec2-deploy-migrate.sh            # aplica as pendentes
#       bash scripts/ec2-deploy-migrate.sh --dry-run  # só mostra o que faria (não grava nada)
#
# Variáveis: PG_CONTAINER (padrão pequenos-grupos-postgres), MIGRATIONS_DIR (padrão db/migrations)
#
# Para criar uma migration nova: adicione db/migrations/NNN_descricao.sql com o
# próximo número. Não edite migrations já aplicadas. Veja db/migrations/README.md.
# =============================================================================
set -uo pipefail
export LC_ALL=C

if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "ERRO: requer bash 4 ou superior." >&2
  exit 1
fi

cd "$(dirname "$0")/.." || { echo "Repo não encontrado"; exit 1; }

PG_CONTAINER="${PG_CONTAINER:-pequenos-grupos-postgres}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-db/migrations}"
# Última migration que, no banco de produção, já estava aplicada quando esta tabela
# de controle foi criada. Não altere: novas migrations vêm DEPOIS desta.
BASELINE_LAST="033_paid_events_and_custom_items.sql"
LOCK_KEY=727274
DRY_RUN=0

usage() {
  sed -n '/^# Uso:/,/^# Variáveis/p' "$0" | sed 's/^# \{0,1\}//'
}

for arg in "$@"; do
  case "$arg" in
    --dry-run|--status) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

# O psql roda dentro do container; $POSTGRES_USER/$POSTGRES_DB vêm do ambiente dele.
PSQL_QUERY='psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
PSQL_APPLY='psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
run_query() { docker exec -i "$PG_CONTAINER" sh -c "$PSQL_QUERY"; }
run_apply() { docker exec -i "$PG_CONTAINER" sh -c "$PSQL_APPLY"; }

checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

SCHEMA_SQL="CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  baseline   BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

# --- pré-condições ----------------------------------------------------------
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
  echo "ERRO: container ${PG_CONTAINER} não está rodando."
  docker ps --format '{{.Names}}' 2>/dev/null || true
  exit 1
fi

shopt -s nullglob
files=()
for p in "$MIGRATIONS_DIR"/*.sql; do files+=("$(basename "$p")"); done
if [ "${#files[@]}" -eq 0 ]; then
  echo "ERRO: nenhuma migration encontrada em $MIGRATIONS_DIR"
  exit 1
fi
for f in "${files[@]}"; do
  if ! [[ "$f" =~ ^[0-9]{3}_[A-Za-z0-9_.-]+\.sql$ ]]; then
    echo "ERRO: nome de migration inválido: $f (esperado NNN_descricao.sql)"
    exit 1
  fi
done

# Duas execuções ao mesmo tempo (ex.: deploy + execução manual) são serializadas.
if [ "$DRY_RUN" -eq 0 ] && command -v flock >/dev/null 2>&1; then
  exec 9>"${MIGRATE_LOCK_FILE:-/tmp/pastoreio-migrate.lock}"
  if ! flock -w 120 9; then
    echo "ERRO: outra execução de migrations está em andamento."
    exit 1
  fi
fi

# --- tabela de controle -----------------------------------------------------
has_tracking=$(echo "SELECT to_regclass('public.schema_migrations') IS NOT NULL;" | run_query) \
  || { echo "ERRO: não foi possível consultar o banco."; exit 1; }

declare -A applied_sum=()
virtual_baseline=0

if [ "$has_tracking" != "t" ]; then
  initialized=$(echo "SELECT to_regclass('public.meetings') IS NOT NULL;" | run_query) \
    || { echo "ERRO: não foi possível consultar o banco."; exit 1; }

  if [ "$initialized" = "t" ]; then
    # Banco que já existe: registra o histórico como aplicado SEM executar.
    # Trava de segurança: só faz isso se o banco realmente está na versão da baseline.
    at_baseline=$(echo "SELECT to_regclass('public.payment_receipts') IS NOT NULL;" | run_query) \
      || { echo "ERRO: não foi possível consultar o banco."; exit 1; }
    if [ "$at_baseline" != "t" ]; then
      echo "ERRO: o banco existe, mas não está na versão de referência (${BASELINE_LAST})."
      echo "      Nada foi alterado. Aplique manualmente as migrations pendentes até essa"
      echo "      versão e rode novamente. Não use este script para recuperar o histórico."
      exit 1
    fi
    baseline_files=()
    for f in "${files[@]}"; do
      if [[ "$f" < "$BASELINE_LAST" || "$f" == "$BASELINE_LAST" ]]; then baseline_files+=("$f"); fi
    done
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] banco existente sem controle: registraria ${#baseline_files[@]} migrations como aplicadas (sem executá-las)."
      for f in "${baseline_files[@]}"; do applied_sum["$f"]="$(checksum "$MIGRATIONS_DIR/$f")"; done
      virtual_baseline=1
    else
      echo "== Primeira execução: registrando ${#baseline_files[@]} migrations existentes como aplicadas (sem executar) =="
      {
        echo "SELECT pg_advisory_xact_lock($LOCK_KEY);"
        echo "$SCHEMA_SQL"
        for f in "${baseline_files[@]}"; do
          echo "INSERT INTO schema_migrations (filename, checksum, baseline) VALUES ('$f', '$(checksum "$MIGRATIONS_DIR/$f")', TRUE) ON CONFLICT DO NOTHING;"
        done
      } | run_apply || { echo "ERRO: falha ao criar a tabela de controle."; exit 1; }
      has_tracking="t"
    fi
  else
    # Banco vazio: cria o controle e aplica tudo, na ordem.
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "[dry-run] banco vazio: criaria schema_migrations e aplicaria todas as ${#files[@]} migrations."
    else
      echo "== Banco vazio: criando schema_migrations =="
      echo "$SCHEMA_SQL" | run_apply || { echo "ERRO: falha ao criar a tabela de controle."; exit 1; }
      has_tracking="t"
    fi
  fi
fi

if [ "$has_tracking" = "t" ]; then
  rows=$(echo "SELECT filename || '|' || checksum FROM schema_migrations;" | run_query) \
    || { echo "ERRO: não foi possível ler schema_migrations."; exit 1; }
  while IFS='|' read -r name sum; do
    [ -n "$name" ] && applied_sum["$name"]="$sum"
  done <<< "$rows"
fi

# --- aplicação --------------------------------------------------------------
n_applied=0; n_skipped=0; n_pending=0; n_warn=0
for f in "${files[@]}"; do
  path="$MIGRATIONS_DIR/$f"
  sum="$(checksum "$path")"

  if [ -n "${applied_sum[$f]+x}" ]; then
    n_skipped=$((n_skipped + 1))
    if [ "${applied_sum[$f]}" != "$sum" ] && [ "$virtual_baseline" -eq 0 ]; then
      echo "AVISO: $f foi alterada depois de aplicada (não será reexecutada). Crie uma migration nova em vez de editar."
      n_warn=$((n_warn + 1))
    fi
    continue
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] pendente: $f"
    n_pending=$((n_pending + 1))
    continue
  fi

  echo "== Aplicando $f =="
  if {
    echo "SELECT pg_advisory_xact_lock($LOCK_KEY);"
    echo "INSERT INTO schema_migrations (filename, checksum) VALUES ('$f', '$sum');"
    cat "$path"
    echo
  } | run_apply; then
    echo "== OK: $f =="
    n_applied=$((n_applied + 1))
  else
    echo "== FALHOU: $f (transação revertida; nada foi gravado). As seguintes não foram executadas. =="
    exit 1
  fi
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] resumo: ${n_pending} pendente(s), ${n_skipped} já aplicada(s). Nada foi gravado."
else
  echo "Resumo: ${n_applied} aplicada(s), ${n_skipped} já registrada(s), ${n_warn} aviso(s)."
  [ "$n_applied" -eq 0 ] && echo "Nada a aplicar: banco já está atualizado."
fi
exit 0
