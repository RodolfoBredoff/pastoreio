# Lista de presença sem depender da EC2 — infraestrutura

Recursos **novos** da página pública de lista de presença servida pelo S3/CloudFront
e das confirmações com a EC2 desligada. Nada criado pelo console (distribuição
`E18FIBR7JAH4S0`, bucket, policy do bucket, OAC do S3, role da EC2) é gerenciado
aqui. Estado local (`terraform.tfstate`, fora do git).

| Recurso | O que é |
|---|---|
| `aws_cloudfront_function.lista_presenca_rewrite` | Mapeia página, arquivos e snapshot de um único roteamento para o S3 |
| `aws_s3_object.site` | Build estático em `s3://pequenos-grupos-bucket/lista-presenca-app/` |
| `aws_dynamodb_table.attendance_buffer` | Buffer das confirmações feitas com a EC2 desligada |
| `aws_lambda_function.offline` + Function URL + OAC | Recebe essas confirmações via `/offline-api/*` |
| `aws_iam_policy.ec2_buffer_sync` | Anexada à role da EC2 para o sync (Scan/Delete/Update na tabela) |

Os roteamentos na distribuição são aplicados por
`scripts/cloudfront-lista-presenca-behaviors.sh` (o `scripts/update-origin.sh`
reescreve o origin da distribuição a cada boot, por isso ela fica fora do Terraform).

**Limite:** a distribuição está no plano gratuito do CloudFront, que aceita no
máximo 5 roteamentos. Por isso página, arquivos e snapshot passam por um só
roteamento (`/lista-presenca-app/*`, ou `/lista-presenca*` depois da troca do link).

## Publicar / atualizar

```bash
aws sso login --profile pastoreio           # se a sessão expirou
npm run build:lista-presenca                # página: apps/lista-presenca-static/dist
npm run build:lista-presenca-lambda         # Lambda: aws/terraform-lista-presenca/lambda/dist
cd aws/terraform-lista-presenca
terraform init
terraform plan -out=tfplan                  # revisar
terraform apply tfplan
```

## Roteamentos (rodar da raiz do repositório; padrão é dry-run, alterar com --apply)

```bash
TF=aws/terraform-lista-presenca
ARN=$(terraform -chdir=$TF output -raw rewrite_function_arn)

# Página de teste: /lista-presenca-app/<slug>
./scripts/cloudfront-lista-presenca-behaviors.sh --stage test --function-arn "$ARN"

# Confirmações com a EC2 desligada: origin da Lambda + /offline-api/*
./scripts/cloudfront-lista-presenca-behaviors.sh --stage offline-api \
  --lambda-domain "$(terraform -chdir=$TF output -raw offline_lambda_origin_domain)" \
  --lambda-oac-id "$(terraform -chdir=$TF output -raw offline_lambda_oac_id)"

# Trocar o link real /lista-presenca/<slug> para a página estática
./scripts/cloudfront-lista-presenca-behaviors.sh --stage public --function-arn "$ARN"

# Desfazer a troca do link real (volta para a EC2)
./scripts/cloudfront-lista-presenca-behaviors.sh --stage rollback-public --function-arn "$ARN"
```

## Sync na EC2

Depois do deploy do app (rota `POST /api/cron/sync-attendance-buffer`), na EC2:

```bash
cd /opt/pequenos-grupos && sudo bash scripts/install-attendance-sync-timer.sh
journalctl -u attendance-sync.service -n 20 --no-pager
```

## Custo

- CloudFront Functions: 2 milhões de execuções/mês no nível gratuito permanente.
- Lambda: 1 milhão de execuções/mês no nível gratuito permanente.
- DynamoDB: capacidade provisionada 5/5, dentro dos 25/25 gratuitos por conta.
  Também limita as gravações em caso de abuso (não há cobrança extra).
- Logs da Lambda: retenção de 14 dias. Objetos no S3: ~260 KB.
