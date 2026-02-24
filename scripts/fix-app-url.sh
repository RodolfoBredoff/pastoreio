#!/bin/bash
# =============================================================================
# fix-app-url.sh
# Migra NEXT_PUBLIC_APP_URL do IP direto da EC2 para a URL fixa do CloudFront.
# Execute UMA ÚNICA VEZ da sua máquina local após configurar o CloudFront.
#
# O que este script faz:
#   1. Atualiza /pequenos-grupos/app/url no SSM Parameter Store
#   2. Atualiza NEXT_PUBLIC_APP_URL no arquivo .env da EC2
#   3. Reinicia os containers Docker para aplicar a mudança
#
# Uso:
#   ./scripts/fix-app-url.sh \
#     --cloudfront-url  https://d1234abcd.cloudfront.net \
#     --instance-id     i-0abc1234def56789              \
#     [--app-dir        /opt/pequenos-grupos]            \
#     [--ssm-path       /pequenos-grupos]                \
#     [--region         us-east-1]
# =============================================================================

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Defaults
# ─────────────────────────────────────────────────────────────────────────────
CLOUDFRONT_URL=""
INSTANCE_ID=""
APP_DIR="/opt/pequenos-grupos"
SSM_PATH="/pequenos-grupos"
AWS_REGION="us-east-1"

# ─────────────────────────────────────────────────────────────────────────────
# Parse de argumentos
# ─────────────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cloudfront-url) CLOUDFRONT_URL="$2"; shift 2 ;;
    --instance-id)    INSTANCE_ID="$2";    shift 2 ;;
    --app-dir)        APP_DIR="$2";        shift 2 ;;
    --ssm-path)       SSM_PATH="$2";       shift 2 ;;
    --region)         AWS_REGION="$2";     shift 2 ;;
    *)
      echo "Argumento desconhecido: $1"
      echo ""
      echo "Uso: $0 --cloudfront-url <url> --instance-id <id> [opções]"
      echo ""
      echo "Opções:"
      echo "  --app-dir   <path>   Diretório da app na EC2  (padrão: /opt/pequenos-grupos)"
      echo "  --ssm-path  <path>   Prefixo SSM              (padrão: /pequenos-grupos)"
      echo "  --region    <region> Região AWS               (padrão: us-east-1)"
      exit 1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Validações
# ─────────────────────────────────────────────────────────────────────────────
ERRORS=0

if [ -z "$CLOUDFRONT_URL" ]; then
  echo "ERRO: --cloudfront-url é obrigatório (ex: https://d1234abcd.cloudfront.net)"
  ERRORS=$((ERRORS+1))
fi

if [ -z "$INSTANCE_ID" ]; then
  echo "ERRO: --instance-id é obrigatório (ex: i-0abc1234def56789)"
  ERRORS=$((ERRORS+1))
fi

# Validar formato da URL
if [ -n "$CLOUDFRONT_URL" ] && [[ ! "$CLOUDFRONT_URL" =~ ^https?:// ]]; then
  echo "ERRO: --cloudfront-url deve começar com http:// ou https://"
  ERRORS=$((ERRORS+1))
fi

[ $ERRORS -gt 0 ] && exit 1

command -v aws &>/dev/null || { echo "ERRO: 'aws' CLI não está instalado."; exit 1; }

echo "============================================"
echo " Migrando NEXT_PUBLIC_APP_URL para CloudFront"
echo "============================================"
echo "CloudFront URL : $CLOUDFRONT_URL"
echo "Instância      : $INSTANCE_ID"
echo "App Dir        : $APP_DIR"
echo "SSM Path       : $SSM_PATH"
echo "Região         : $AWS_REGION"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Verificar valor atual no SSM
# ─────────────────────────────────────────────────────────────────────────────
CURRENT_SSM=$(aws ssm get-parameter \
  --name "${SSM_PATH}/app/url" \
  --query "Parameter.Value" \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "(parâmetro não existe)")

echo "Valor atual no SSM (${SSM_PATH}/app/url): $CURRENT_SSM"
echo "Novo valor                               : $CLOUDFRONT_URL"
echo ""

# Confirmar se o valor já está correto
if [ "$CURRENT_SSM" = "$CLOUDFRONT_URL" ]; then
  echo "O SSM já está com o valor correto. Verificando a EC2..."
else
  # ─────────────────────────────────────────────────────────────────────────
  # 1. Atualizar SSM Parameter Store
  # ─────────────────────────────────────────────────────────────────────────
  echo "[1/3] Atualizando SSM Parameter Store..."
  aws ssm put-parameter \
    --name "${SSM_PATH}/app/url" \
    --value "$CLOUDFRONT_URL" \
    --type "String" \
    --overwrite \
    --region "$AWS_REGION" > /dev/null

  echo "SSM atualizado: ${SSM_PATH}/app/url = $CLOUDFRONT_URL"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Verificar se EC2 está Online no SSM
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "Verificando conectividade SSM com a instância..."
SSM_STATUS=$(aws ssm describe-instance-information \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query "InstanceInformationList[0].PingStatus" \
  --output text 2>/dev/null || echo "None")

if [ "$SSM_STATUS" != "Online" ]; then
  echo "AVISO: Instância $INSTANCE_ID não está Online no SSM (status: $SSM_STATUS)."
  echo "O SSM Parameter Store foi atualizado. Quando a EC2 estiver online, execute:"
  echo ""
  echo "  aws ssm send-command \\"
  echo "    --instance-ids $INSTANCE_ID \\"
  echo "    --document-name AWS-RunShellScript \\"
  echo "    --parameters 'commands=[\"cd $APP_DIR && grep -q NEXT_PUBLIC_APP_URL .env && sed -i 's|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=$CLOUDFRONT_URL|g' .env || echo NEXT_PUBLIC_APP_URL=$CLOUDFRONT_URL >> .env\",\"docker-compose -f docker-compose.prod.yml up -d\"]' \\"
  echo "    --region $AWS_REGION"
  exit 0
fi
echo "SSM: Online ✓"

# ─────────────────────────────────────────────────────────────────────────────
# Montar comandos para atualizar .env e reiniciar containers na EC2
# ─────────────────────────────────────────────────────────────────────────────
ENV_FILE="${APP_DIR}/.env"

# Usar base64 para evitar problemas de escaping com a URL no JSON do SSM
EC2_COMMANDS=$(cat <<EOF
set -euo pipefail

ENV_FILE="${ENV_FILE}"
CLOUDFRONT_URL="${CLOUDFRONT_URL}"

echo "=== Atualizando NEXT_PUBLIC_APP_URL na EC2 ==="

# Verificar valor atual no .env
if [ -f "\$ENV_FILE" ]; then
  CURRENT=\$(grep "^NEXT_PUBLIC_APP_URL=" "\$ENV_FILE" || echo "(não encontrada)")
  echo "Linha atual no .env: \$CURRENT"
fi

# Atualizar ou adicionar NEXT_PUBLIC_APP_URL no .env
if [ -f "\$ENV_FILE" ] && grep -q "^NEXT_PUBLIC_APP_URL=" "\$ENV_FILE"; then
  sed -i "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\${CLOUDFRONT_URL}|" "\$ENV_FILE"
  echo "Linha atualizada no .env."
else
  echo "NEXT_PUBLIC_APP_URL=\${CLOUDFRONT_URL}" >> "\$ENV_FILE"
  echo "Linha adicionada ao .env."
fi

echo "Novo valor no .env: \$(grep NEXT_PUBLIC_APP_URL \$ENV_FILE)"

# Reiniciar containers para aplicar a mudança
echo ""
echo "Reiniciando containers..."
cd "${APP_DIR}"
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "Containers iniciados:"
docker-compose -f docker-compose.prod.yml ps
EOF
)

if base64 --version 2>&1 | grep -q GNU; then
  ENCODED_COMMANDS=$(echo "$EC2_COMMANDS" | base64 -w0)
else
  ENCODED_COMMANDS=$(echo "$EC2_COMMANDS" | base64 | tr -d '\n')
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Atualizar .env na EC2
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "[2/3] Atualizando .env e reiniciando containers na EC2..."

COMMAND_ID=$(aws ssm send-command \
  --instance-ids "$INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters "{\"commands\":[\"echo '${ENCODED_COMMANDS}' | base64 -d | bash\"]}" \
  --timeout-seconds 120 \
  --region "$AWS_REGION" \
  --output text \
  --query "Command.CommandId")

echo "Command ID: $COMMAND_ID"
echo "Aguardando..."

# Polling
for i in $(seq 1 24); do
  STATUS=$(aws ssm get-command-invocation \
    --command-id "$COMMAND_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query "Status" \
    --output text 2>/dev/null || echo "InProgress")

  if [ "$STATUS" = "Success" ] || [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ]; then
    break
  fi
  echo "  Status: $STATUS ($i/24)..."
  sleep 5
done

# Output
echo ""
echo "=== Output da EC2 ==="
aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query "StandardOutputContent" \
  --output text 2>/dev/null || true

STDERR=$(aws ssm get-command-invocation \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query "StandardErrorContent" \
  --output text 2>/dev/null || true)

[ -n "$STDERR" ] && echo "" && echo "=== Erros ===" && echo "$STDERR"

# ─────────────────────────────────────────────────────────────────────────────
# 3. Resultado final
# ─────────────────────────────────────────────────────────────────────────────
echo ""
if [ "$STATUS" = "Success" ]; then
  echo "[3/3] Verificando health da aplicação..."
  sleep 10

  HEALTH_ID=$(aws ssm send-command \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --parameters 'commands=["curl -sf http://localhost:80/api/health && echo OK || echo FALHOU"]' \
    --timeout-seconds 30 \
    --region "$AWS_REGION" \
    --output text \
    --query "Command.CommandId")

  sleep 15

  HEALTH_OUTPUT=$(aws ssm get-command-invocation \
    --command-id "$HEALTH_ID" \
    --instance-id "$INSTANCE_ID" \
    --region "$AWS_REGION" \
    --query "StandardOutputContent" \
    --output text 2>/dev/null || echo "timeout")

  echo "Health check: $HEALTH_OUTPUT"
  echo ""
  echo "============================================"
  echo " Migração concluída com sucesso!"
  echo "============================================"
  echo ""
  echo "NEXT_PUBLIC_APP_URL agora aponta para: $CLOUDFRONT_URL"
  echo ""
  echo "Esta URL é fixa — não muda quando a EC2 reinicia."
  echo "O update-origin.service cuidará de atualizar o origin do CloudFront"
  echo "automaticamente a cada boot."
else
  echo "ERRO: Falha ao atualizar a EC2 (status: $STATUS)."
  echo "O SSM Parameter Store foi atualizado, mas o .env na EC2 pode estar desatualizado."
  echo "Verifique o output acima e tente novamente."
  exit 1
fi
