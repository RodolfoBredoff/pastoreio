# Backup Automatizado do Banco de Dados para S3

Este documento descreve como configurar backups automáticos diários do PostgreSQL para o Amazon S3 usando o script `scripts/backup-to-s3.sh`.

---

## Pré-requisitos

- EC2 com IAM Role que permita `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject`
- AWS CLI instalada na instância (`sudo apt-get install awscli -y`)
- Cliente PostgreSQL instalado (`sudo apt-get install postgresql-client -y`)
- Bucket S3 criado (ex: `meu-bucket-backups`)

---

## 1. Criar o bucket S3 (caso não exista)

```bash
aws s3 mb s3://meu-bucket-backups --region us-east-1
```

Habilite o versionamento para proteção extra:

```bash
aws s3api put-bucket-versioning \
  --bucket meu-bucket-backups \
  --versioning-configuration Status=Enabled
```

---

## 2. Configurar a IAM Role da EC2

Adicione a seguinte policy inline à role da EC2 (`pequenos-grupos-ec2-role` ou similar):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::meu-bucket-backups",
        "arn:aws:s3:::meu-bucket-backups/*"
      ]
    }
  ]
}
```

---

## 3. Configurar variáveis de ambiente

No arquivo `/etc/environment` da EC2 (ou no `.env` do serviço):

```bash
DB_NAME=pequenos_grupos
DB_USER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_PASSWORD=SUA_SENHA_DO_BANCO
S3_BUCKET=meu-bucket-backups
S3_PREFIX=db-backups/pequenos-grupos
AWS_REGION=us-east-1
BACKUP_RETENTION_DAYS=30
```

---

## 4. Testar o script manualmente

```bash
# Na EC2, a partir do diretório do projeto
chmod +x scripts/backup-to-s3.sh

# Executar
DB_PASSWORD=SUA_SENHA bash scripts/backup-to-s3.sh
```

A saída esperada:
```
[backup] Iniciando backup de 'pequenos_grupos' em 20240416_030000...
[backup] Backup gerado: /tmp/pg-backups/pequenos_grupos_20240416_030000.sql.gz (1.2M)
[backup] Upload concluído: s3://meu-bucket-backups/db-backups/pequenos-grupos/pequenos_grupos_20240416_030000.sql.gz
[backup] Arquivo local removido.
[backup] Removendo backups com mais de 30 dias no S3...
[backup] Backup concluído com sucesso em Tue Apr 16 03:00:05 UTC 2024.
```

---

## 5. Agendar via crontab (diário às 03:00)

```bash
crontab -e
```

Adicione a linha:

```cron
0 3 * * * DB_PASSWORD=SUA_SENHA S3_BUCKET=meu-bucket-backups bash /home/ubuntu/pequenos-grupos/scripts/backup-to-s3.sh >> /var/log/pg-backup.log 2>&1
```

Verifique o log após a primeira execução:

```bash
tail -f /var/log/pg-backup.log
```

---

## 6. Verificar backups no S3

```bash
aws s3 ls s3://meu-bucket-backups/db-backups/pequenos-grupos/ --human-readable
```

---

## 7. Restaurar um backup

```bash
# Baixar o backup desejado
aws s3 cp \
  s3://meu-bucket-backups/db-backups/pequenos-grupos/pequenos_grupos_20240416_030000.sql.gz \
  /tmp/restore.sql.gz

# Descompactar
gunzip /tmp/restore.sql.gz

# Restaurar (ATENÇÃO: apaga dados atuais!)
psql -h localhost -U postgres -d pequenos_grupos < /tmp/restore.sql
```

---

## Política de Retenção

Por padrão, backups com mais de **30 dias** são removidos automaticamente pelo script.  
Ajuste `BACKUP_RETENTION_DAYS` conforme necessário.

Para custo mínimo, o upload usa `STANDARD_IA` (Infrequent Access), ~60% mais barato que Standard.

---

## Alternativa: AWS EventBridge Scheduler (sem cron na EC2)

Se preferir não usar crontab, crie uma Lambda que chame a API interna de backup, ou use o EventBridge para acionar um SSM Run Command que execute o script na EC2:

```bash
aws events put-rule \
  --name "PequenosGruposBackupDiario" \
  --schedule-expression "cron(0 3 * * ? *)" \
  --state ENABLED

# Depois associe um target SSM Run Command à regra
```

Consulte a documentação AWS para configurar o target SSM.
