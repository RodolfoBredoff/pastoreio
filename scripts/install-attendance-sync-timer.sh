#!/usr/bin/env bash
# =============================================================================
# install-attendance-sync-timer.sh
#
# Rodar NA EC2 (como root/sudo). Instala um timer systemd que chama
# POST /api/cron/sync-attendance-buffer 3 minutos após o boot e depois a cada
# 5 minutos, passando para o Postgres as confirmações recebidas pela Lambda
# enquanto a instância estava desligada.
#
# Uso:  sudo bash scripts/install-attendance-sync-timer.sh [--app-dir /opt/pequenos-grupos]
# Remover: sudo systemctl disable --now attendance-sync.timer &&
#          sudo rm /etc/systemd/system/attendance-sync.{service,timer} && sudo systemctl daemon-reload
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
if ! grep -q '^ATTENDANCE_SNAPSHOT_SECRET=' "$APP_DIR/.env"; then
  echo "ATTENDANCE_SNAPSHOT_SECRET não encontrado em $APP_DIR/.env" >&2; exit 1
fi

cat > /usr/local/bin/attendance-sync.sh <<EOF
#!/usr/bin/env bash
# Chamado pelo attendance-sync.service. O segredo é lido do .env a cada execução.
set -euo pipefail
SECRET=\$(grep '^ATTENDANCE_SNAPSHOT_SECRET=' "$APP_DIR/.env" | cut -d= -f2-)
exec curl -fsS -m 120 -X POST -H "Authorization: Bearer \$SECRET" \\
  http://localhost:80/api/cron/sync-attendance-buffer
EOF
chmod 700 /usr/local/bin/attendance-sync.sh

cat > /etc/systemd/system/attendance-sync.service <<'EOF'
[Unit]
Description=Sincroniza confirmacoes offline da lista de presenca (DynamoDB -> Postgres)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/attendance-sync.sh
EOF

cat > /etc/systemd/system/attendance-sync.timer <<'EOF'
[Unit]
Description=Sync das confirmacoes offline no boot e a cada 5 minutos

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
AccuracySec=30s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now attendance-sync.timer
systemctl list-timers attendance-sync.timer --no-pager
echo
echo "Instalado. Rodar agora: sudo systemctl start attendance-sync.service"
echo "Ver resultado:          journalctl -u attendance-sync.service -n 20 --no-pager"
