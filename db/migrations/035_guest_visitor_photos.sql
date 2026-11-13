-- Migration 035: foto opcional (miniatura) do visitante não cadastrado
-- A miniatura é gerada no navegador (máx. ~256px, WebP/JPEG, poucos KB) e guardada aqui,
-- em tabela separada para que consultas de visitantes nunca carreguem os bytes por engano.
-- Só existe com consentimento registrado (consent_at). Apagar o visitante apaga a foto.
CREATE TABLE IF NOT EXISTS guest_visitor_photos (
  guest_id UUID PRIMARY KEY REFERENCES guest_visitors(id) ON DELETE CASCADE,
  mime_type VARCHAR(20) NOT NULL CHECK (mime_type IN ('image/webp', 'image/jpeg')),
  data BYTEA NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 61440),
  consent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  registered_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE guest_visitor_photos IS 'Miniatura opcional do visitante, com consentimento registrado';
COMMENT ON COLUMN guest_visitor_photos.consent_at IS 'Quando o líder confirmou que o visitante autorizou o registro da foto';
