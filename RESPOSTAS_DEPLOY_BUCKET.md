# Respostas sobre Deploy e Bucket S3

## 1. O banco será atualizado automaticamente no deploy?

**SIM!** ✅

O workflow de deploy (`.github/workflows/deploy-aws.yml`) já está configurado para executar migrações de banco automaticamente.

### Como funciona:

1. **Step "Apply database migration on EC2"** (linha 218-253)
   - Executa o script `scripts/ec2-deploy-migrate.sh` na EC2
   - Aguarda até 3 minutos (36 iterações × 5 segundos)
   - Mostra output de sucesso ou erro
   - Falha o deploy se a migration falhar

2. **Script de migração** (`scripts/ec2-deploy-migrate.sh`):
   - Executa `psql` com todos os arquivos `.sql` do diretório `db/migrations/`
   - Usa `ON CONFLICT DO NOTHING` ou `IF NOT EXISTS` para ser idempotente
   - Pode ser executado múltiplas vezes sem problemas

### Nossa migração é segura:

```sql
-- Todos os comandos usam IF NOT EXISTS ou ADD COLUMN IF NOT EXISTS
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_paid_event BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS payment_pix_key TEXT;

CREATE TABLE IF NOT EXISTS payment_receipts (...);
```

**Resultado:** Quando você fizer o deploy para produção, a migração será aplicada automaticamente!

---

## 2. Qual bucket está sendo usado para os comprovantes?

**Reutiliza o bucket existente!** ✅

### Configuração atual:

A API de presigned URL (`app/api/lista-presenca/[slug]/payment-presign/route.ts`) usa:

```typescript
const bucket = process.env.INVITE_COVERS_BUCKET || process.env.S3_BUCKET;
```

Isso significa:
- **Bucket:** O mesmo que já é usado para capas de convite
- **Variável de ambiente:** `INVITE_COVERS_BUCKET` (já configurada na EC2)
- **Fallback:** `S3_BUCKET` se `INVITE_COVERS_BUCKET` não estiver definido

### Organização dentro do bucket:

```
bucket-root/
├── invite-covers/          # Capas de convite (já existe)
│   └── {meeting_id}/
│       └── {timestamp}-{uuid}.jpg
│
└── payment-receipts/       # Comprovantes de pagamento (novo)
    └── {meeting_id}/
        └── {timestamp}-{nome}_{sobrenome}-{uuid}.jpg
```

### Segurança:

- ✅ Bucket já existe e está configurado
- ✅ IAM Role da EC2 já tem permissões `s3:PutObject` no bucket
- ✅ Presigned URLs expiram em 2 minutos
- ✅ Arquivos ficam em paths diferentes (`payment-receipts/` vs `invite-covers/`)

---

## 3. Preciso criar algo novo?

**NÃO!** 🎉

Tudo já está pronto:
- ✅ Migração de banco será aplicada automaticamente no deploy
- ✅ Bucket S3 já existe (reutilizado)
- ✅ Permissões IAM já estão configuradas
- ✅ Variáveis de ambiente já estão na EC2

---

## 4. Variáveis de ambiente necessárias

Nenhuma nova variável precisa ser configurada! As existentes já são suficientes:

```bash
# Já configuradas na EC2:
AWS_REGION=us-east-1
INVITE_COVERS_BUCKET=pequenos-grupos-bucket  # ou similar
INVITE_COVERS_PUBLIC_BASE_URL=https://pg.skillia.click
```

**Opcional:** Se quiser um bucket dedicado para comprovantes no futuro:

```bash
# Apenas se quiser separar (não é obrigatório):
PAYMENT_RECEIPTS_BUCKET=novo-bucket-dedicado
```

---

## Resumo

✅ **Deploy:** Migração será aplicada automaticamente  
✅ **Bucket:** Reutiliza o mesmo bucket das capas de convite  
✅ **Permissões:** Já estão configuradas  
✅ **Variáveis:** Nenhuma nova precisa ser configurada  

**Pode fazer o deploy quando quiser!** 🚀
