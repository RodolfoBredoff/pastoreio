-- Migration 027: Permitir múltiplos valores por tag
-- Remove a constraint que impede múltiplos valores para a mesma tag_key
-- Adiciona constraint para evitar duplicatas exatas (member_id + tag_key + tag_value)

ALTER TABLE member_tags 
  DROP CONSTRAINT IF EXISTS member_tags_member_key_unique;

ALTER TABLE member_tags 
  ADD CONSTRAINT member_tags_no_duplicate_values 
  UNIQUE (member_id, tag_key, tag_value);

-- Comentário explicativo
COMMENT ON TABLE member_tags IS 'Tags livres (chave/valor) por membro. Cada membro pode ter múltiplos valores para a mesma chave (ex: habilidade=[música, ensino])';
