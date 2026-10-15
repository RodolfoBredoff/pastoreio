#!/usr/bin/env bash
# Limpeza segura de disco na EC2 antes do deploy.
# NÃO toca em volumes de dados (postgres_data em /mnt/postgres-data) nem no banco.
set -u

echo "== df -h / (antes) =="
df -h / 2>/dev/null | tail -2 || true

echo "== docker system df =="
docker system df 2>/dev/null || true

echo "== imagens dangling (camadas de deploys antigos) =="
docker image prune -f 2>/dev/null || true

echo "== build cache =="
docker builder prune -f 2>/dev/null || true

echo "== containers parados =="
docker container prune -f 2>/dev/null || true

echo "== imagens antigas do app (mantém :latest) =="
for APP_IMAGE in ghcr.io/rodolfobredoff/pastoreio ghcr.io/rodolfobredoff/pequenos-grupos; do
  OLD_IDS=$(docker images "$APP_IMAGE" --format '{{.ID}} {{.Tag}}' 2>/dev/null \
    | awk '$2 != "latest" {print $1}' | sort -u)
  if [ -n "$OLD_IDS" ]; then
    # shellcheck disable=SC2086
    docker rmi -f $OLD_IDS 2>/dev/null || true
  fi
done

echo "== journal (systemd) =="
journalctl --vacuum-size=50M 2>/dev/null || true

echo "== cache de pacotes =="
apt-get clean 2>/dev/null || true
rm -rf /var/cache/apt/archives/*.deb 2>/dev/null || true

echo "== /tmp =="
find /tmp -mindepth 1 -maxdepth 1 -mtime +2 -exec rm -rf {} + 2>/dev/null || true

echo "== df -h / (depois) =="
df -h / 2>/dev/null | tail -2 || true

echo "== docker system df (depois) =="
docker system df 2>/dev/null || true
