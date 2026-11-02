-- Migration 033: Eventos pagos + exibir itens personalizados na lista pública
-- Objetivo:
-- 1. Permitir que eventos especiais sejam marcados como "pagos" com chave PIX
-- 2. Armazenar comprovantes de pagamento enviados pelos usuários
-- 3. Exibir itens personalizados (não pré-definidos) na lista pública

-- 1) Adicionar colunas para eventos pagos
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_paid_event BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS payment_pix_key TEXT;

COMMENT ON COLUMN meetings.is_paid_event IS 'Se TRUE, o evento requer pagamento antes da confirmação';
COMMENT ON COLUMN meetings.payment_pix_key IS 'Chave PIX para pagamento (email, telefone, CPF ou chave aleatória)';

-- 2) Tabela de comprovantes de pagamento
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  -- Dados do usuário que enviou
  user_first_name VARCHAR(120) NOT NULL,
  user_last_name VARCHAR(120) NOT NULL,
  user_email VARCHAR(255),
  user_phone VARCHAR(20),
  -- Dados do arquivo
  receipt_url TEXT NOT NULL,
  receipt_object_key TEXT NOT NULL,
  -- Metadados
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Status de verificação (opcional, para uso futuro)
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES leaders(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_meeting
  ON payment_receipts(meeting_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_email
  ON payment_receipts(user_email);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_phone
  ON payment_receipts(user_phone);

-- 3) Adicionar coluna de comprovante nas entradas públicas
-- Quando o usuário envia comprovante, vincula ao registro de confirmação
ALTER TABLE attendance_list_public_entries
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipts(id) ON DELETE SET NULL;

ALTER TABLE attendance_list_responses
  ADD COLUMN IF NOT EXISTS payment_receipt_id UUID REFERENCES payment_receipts(id) ON DELETE SET NULL;

COMMENT ON COLUMN attendance_list_public_entries.payment_receipt_id IS 'Comprovante de pagamento (se evento pago)';
COMMENT ON COLUMN attendance_list_responses.payment_receipt_id IS 'Comprovante de pagamento (se evento pago)';
