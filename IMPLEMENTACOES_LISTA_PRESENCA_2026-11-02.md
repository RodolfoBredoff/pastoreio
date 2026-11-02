# Funcionalidades Implementadas - Lista de Presença

## Data: 02/11/2026

### 1. Bug Fix: Itens Personalizados na Lista Pública

**Problema Identificado:**
Quando um usuário inseria um item personalizado (não pré-preenchido) em um campo adicional da lista de presença, esse item não aparecia na lista pública porque a função `getExtraOptionCounts` só contava opções que estavam na configuração do campo.

**Solução Implementada:**
- Modificada a função `getExtraOptionCounts` em `lib/attendance-list-public.ts`
- Agora a função conta tanto opções pré-definidas quanto itens personalizados digitados pelos usuários
- A lógica de normalização case-insensitive foi mantida para opções pré-definidas
- Itens personalizados são exibidos exatamente como foram digitados

**Arquivos Modificados:**
- `lib/attendance-list-public.ts` - Função `getExtraOptionCounts`

---

### 2. Feature: Eventos Pagos com Comprovante

**Objetivo:**
Permitir que eventos especiais sejam marcados como "pagos", exigindo que os participantes enviem comprovante de pagamento antes de confirmar presença.

**Funcionalidades:**
1. **Configuração pelo Administrador:**
   - Flag "Este é um evento pago" na criação de encontros especiais
   - Campo para informar a chave PIX para pagamento
   - Aparência visual destacada (borda amarela) na seção de evento pago

2. **Fluxo do Usuário:**
   - Preenche nome, sobrenome e email/telefone
   - Se houver campos adicionais e o usuário preencher algum item, pode confirmar sem pagamento
   - Se não preencheu campos adicionais, deve enviar comprovante de pagamento:
     - Modal aparece solicitando PIX para a chave cadastrada
     - Upload do comprovante (JPG, PNG, WEBP ou PDF, máx. 10MB)
     - Upload via presigned URL para S3
     - Confirmação só é completada após envio do comprovante

3. **Armazenamento:**
   - Comprovantes são salvos em bucket S3 dedicado
   - Nome do arquivo inclui: nome, email e nome do evento
   - Tabela `payment_receipts` armazena metadados dos comprovantes
   - Vinculação do comprovante com o registro de confirmação

**Implementação Técnica:**

### Migração de Banco de Dados
Arquivo: `db/migrations/033_paid_events_and_custom_items.sql`
- Adicionadas colunas `is_paid_event` e `payment_pix_key` na tabela `meetings`
- Criada tabela `payment_receipts` para armazenar comprovantes
- Adicionada coluna `payment_receipt_id` nas tabelas de confirmação

### APIs Criadas
Arquivo: `app/api/lista-presenca/[slug]/payment-presign/route.ts`
- Endpoint público para gerar presigned URLs de upload de comprovantes
- Validações:
  - Evento deve ser pago
  - Tipo de arquivo aceito (JPG, PNG, WEBP, PDF)
  - Tamanho máximo 10MB
  - Nome e sobrenome obrigatórios

### Modificações em Arquivos Existentes

**Frontend:**
- `components/agenda/agenda-client.tsx`:
  - Adicionados estados `isPaidEvent` e `paymentPixKey`
  - UI para configurar evento pago na criação
  - Limpeza dos estados ao fechar modal

- `components/lista-presenca/public-attendance-view.tsx`:
  - Estados para gerenciar modal de pagamento
  - Funções `needsPayment()`, `hasFilledExtraField()`
  - Modal de pagamento com upload de comprovante
  - Aviso visual de evento pago
  - Integração com presigned URL para upload

**Backend:**
- `app/api/meetings/route.ts`:
  - Suporte aos campos `is_paid_event` e `payment_pix_key`
  - Validação: chave PIX é obrigatória se evento é pago

- `lib/attendance-list-public.ts`:
  - Estendido tipo `PublicAttendanceListMeeting` com campos de pagamento
  - Funções `publicCreateOpenEntry` e `publicConfirmPrefilledByPhoneOrEmail`:
    - Aceitam parâmetro `payment_receipt_id`
    - Lógica de negócio: se preencheu campo adicional, não precisa de pagamento
    - Validação do receipt quando fornecido
    - Inserção do receipt_id nas tabelas de confirmação

- `app/api/lista-presenca/[slug]/route.ts`:
  - Aceita `payment_receipt_id` no body das requisições
  - Passa o parâmetro para as funções de confirmação

**Infraestrutura:**
- Comprovantes são armazenados em S3 (bucket configurável via `PAYMENT_RECEIPTS_BUCKET`)
- Estrutura de path: `payment-receipts/{meeting_id}/{timestamp}-{nome_sobrenome}-{uuid}.{ext}`

---

## Variáveis de Ambiente Necessárias

Para produção, configure as seguintes variáveis:

```bash
# Bucket para comprovantes de pagamento (opcional, usa INVITE_COVERS_BUCKET se não definido)
PAYMENT_RECEIPTS_BUCKET=nome-do-bucket

# Região AWS (já configurada para outras funcionalidades)
AWS_REGION=us-east-1

# Credenciais AWS (já configuradas)
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***
```

---

## Testes Recomendados

### Bug Fix - Itens Personalizados
1. Criar encontro especial com campo adicional de opções + "permitir resposta própria"
2. Como usuário, digitar um item personalizado
3. Verificar se o item aparece na lista pública com contagem

### Eventos Pagos
1. **Cenário 1: Com campo adicional preenchido**
   - Criar evento pago com campo adicional
   - Preencher campo adicional
   - Verificar se confirma sem pedir pagamento

2. **Cenário 2: Sem campo adicional**
   - Criar evento pago sem campo adicional
   - Verificar se modal de pagamento aparece
   - Testar upload de comprovante
   - Verificar se confirmação é registrada

3. **Cenário 3: Com campo adicional mas não preenchido**
   - Criar evento pago com campo adicional
   - Não preencher o campo
   - Verificar se pede pagamento
   - Enviar comprovante
   - Verificar se confirmação é registrada

---

## Observações Importantes

1. **Segurança:**
   - Comprovantes são armazenados em S3 privado
   - Presigned URLs expiram em 2 minutos
   - Validação server-side do receipt_id antes de confirmar

2. **Privacidade:**
   - Comprovantes contêm dados pessoais
   - Acesso restrito aos administradores do grupo
   - Não são exibidos publicamente

3. **UX:**
   - Modal de pagamento é claro e informativo
   - Feedback visual durante upload
   - Mensagem de sucesso/erro clara

4. **Backward Compatibility:**
   - Campos `is_paid_event` e `payment_pix_key` têm default `FALSE` e `NULL`
   - Migração é segura para dados existentes
   - Não afeta eventos já criados

---

## Próximos Passos (Sugestões)

1. Implementar visualização de comprovantes para administradores
2. Adicionar status de verificação de pagamento (verified_at, verified_by)
3. Notificações para administradores quando houver comprovantes pendentes
4. Relatório de pagamentos recebidos por evento
5. Integração com gateway de pagamento para confirmação automática
