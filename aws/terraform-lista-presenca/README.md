# Lista de presença sem depender da EC2 — infraestrutura

Recursos **novos** da página pública de lista de presença servida pelo S3/CloudFront.
Nada criado pelo console (distribuição `E18FIBR7JAH4S0`, bucket, policy, OAC) é
gerenciado aqui. Estado local (`terraform.tfstate`, fora do git).

| Recurso | O que é |
|---|---|
| `aws_cloudfront_function.lista_presenca_rewrite` | Reescreve `/lista-presenca/<slug>` para `/lista-presenca-app/index.html` |
| `aws_s3_object.site` | Build estático em `s3://pequenos-grupos-bucket/lista-presenca-app/` |

Os roteamentos na distribuição existente são aplicados por
`scripts/cloudfront-lista-presenca-behaviors.sh` (o `scripts/update-origin.sh`
reescreve o origin da distribuição a cada boot, por isso ela fica fora do Terraform).

## Publicar / atualizar a página

```bash
aws sso login --profile pastoreio           # se a sessão expirou
npm run build:lista-presenca                # gera apps/lista-presenca-static/dist
cd aws/terraform-lista-presenca
terraform init
terraform plan -out=tfplan                  # revisar
terraform apply tfplan
```

## Roteamentos (rodar da raiz do repositório; padrão é dry-run)

```bash
ARN=$(terraform -chdir=aws/terraform-lista-presenca output -raw rewrite_function_arn)

# 1. Caminhos de teste: /snapshots/* e /lista-presenca-app/*
./scripts/cloudfront-lista-presenca-behaviors.sh --stage test --function-arn "$ARN"            # diff
./scripts/cloudfront-lista-presenca-behaviors.sh --stage test --function-arn "$ARN" --apply

# 2. Trocar o link real /lista-presenca/* para a página estática
./scripts/cloudfront-lista-presenca-behaviors.sh --stage public --function-arn "$ARN" --apply

# Desfazer só a troca do link real (volta para a EC2)
./scripts/cloudfront-lista-presenca-behaviors.sh --stage rollback-public --apply
```

Teste: `https://pg.skillia.click/lista-presenca-app/<slug>`

## Custo

CloudFront Functions: 2 milhões de execuções/mês no nível gratuito permanente
(depois, US$ 0,10 por milhão). Objetos no S3: ~260 KB. Sem custo fixo mensal.
