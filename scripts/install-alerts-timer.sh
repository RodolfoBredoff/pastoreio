#!/usr/bin/env bash
# =============================================================================
# install-alerts-timer.sh
#
# Rodar NA EC2 (sudo). Liga os alertas do app sem custo de envio:
#   1. Gera, se ainda não existirem no .env: CRON_SECRET e o par de chaves VAPID
#      (Web Push). Os valores não são impressos.
#   2. Instala pastoreio-alerts.timer: chama GET /api/cron/check-alerts todo dia às
#      08:20 (horário de Brasília), dentro da janela em que a EC2 fica ligada.
#      Persistent=true: se a instância estava desligada no horário, roda no boot.
#
# Depois de rodar: recriar o app para ler as variáveis novas
#   cd /opt/pequenos-grupos && docker-compose -f docker-compose.prod.yml up -d
#
# Uso:      sudo bash scripts/install-alerts-timer.sh [--app-dir /opt/pequenos-grupos]
# Rodar já: sudo systemctl start pastoreio-alerts.service
# Log:      journalctl -u pastoreio-alerts.service -n 20 --no-pager
# Remover:  sudo systemctl disable --now pastoreio-alerts.timer &&
#           sudo rm /etc/systemd/system/pastoreio-alerts.{service,timer} \
#                   /usr/local/bin/pastoreio-alerts.sh && sudo systemctl daemon-reload
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
ENV_FILE="$APP_DIR/.env"
[[ -f "$ENV_FILE" ]] || { echo "$ENV_FILE não encontrado" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl não encontrado" >&2; exit 1; }

has() { grep -qE "^$1=.+" "$ENV_FILE"; }
b64url() { base64 -w0 | tr '+/' '-_' | tr -d '='; }

cp -p "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"

if ! has CRON_SECRET; then
  sed -i '/^CRON_SECRET=/d' "$ENV_FILE"
  echo "CRON_SECRET=$(openssl rand -hex 32)" >> "$ENV_FILE"
  echo "CRON_SECRET gerado."
else
  echo "CRON_SECRET já existe (mantido)."
fi

if ! has VAPID_PUBLIC_KEY || ! has VAPID_PRIVATE_KEY; then
  TMP="$(mktemp)"; chmod 600 "$TMP"
  openssl ecparam -name prime256v1 -genkey -noout -out "$TMP" 2>/dev/null
  # Chave pública: ponto não comprimido (65 bytes). Privada: escalar de 32 bytes.
  PUB=$(openssl ec -in "$TMP" -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)
  PRIV=$(openssl ec -in "$TMP" -outform DER 2>/dev/null | head -c 39 | tail -c 32 | b64url)
  rm -f "$TMP"
  [[ ${#PUB} -eq 87 && ${#PRIV} -eq 43 ]] || { echo "ERRO ao gerar chaves VAPID" >&2; exit 1; }
  sed -i '/^VAPID_PUBLIC_KEY=/d;/^VAPID_PRIVATE_KEY=/d' "$ENV_FILE"
  echo "VAPID_PUBLIC_KEY=$PUB" >> "$ENV_FILE"
  echo "VAPID_PRIVATE_KEY=$PRIV" >> "$ENV_FILE"
  echo "Chaves VAPID geradas."
else
  echo "Chaves VAPID já existem (mantidas)."
fi

cat > /usr/local/bin/pastoreio-alerts.sh <<EOF
#!/usr/bin/env bash
# Chamado por pastoreio-alerts.service. O segredo é lido do .env a cada execução.
set -euo pipefail
SECRET=\$(grep '^CRON_SECRET=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
exec curl -fsS -m 300 -H "Authorization: Bearer \$SECRET" http://localhost:80/api/cron/check-alerts
EOF
chmod 700 /usr/local/bin/pastoreio-alerts.sh

cat > /etc/systemd/system/pastoreio-alerts.service <<'EOF'
[Unit]
Description=Alertas do Pastoreio (faltas, aniversarios, chamada pendente, resumo semanal)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/pastoreio-alerts.sh
EOF

cat > /etc/systemd/system/pastoreio-alerts.timer <<'EOF'
[Unit]
Description=Alertas do Pastoreio todo dia as 08:20 (Brasilia) e no boot se o horario foi perdido

[Timer]
OnCalendar=*-*-* 08:20:00 America/Sao_Paulo
Persistent=true
RandomizedDelaySec=60

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now pastoreio-alerts.timer
systemctl list-timers pastoreio-alerts.timer --no-pager
echo
echo "Próximo passo: cd $APP_DIR && docker-compose -f docker-compose.prod.yml up -d"
