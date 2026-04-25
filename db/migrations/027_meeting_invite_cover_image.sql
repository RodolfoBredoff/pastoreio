-- Migration 027: Capa do convite do encontro (imagem opcional)
-- Armazena URL pública (ex.: CloudFront) e key do objeto (S3) para permitir trocar/remover.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS invite_cover_image_url TEXT NULL;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS invite_cover_image_key TEXT NULL;

