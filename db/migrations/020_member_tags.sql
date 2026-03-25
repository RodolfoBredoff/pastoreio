-- Tags livres (chave/valor) por membro, definidas pelo líder do grupo.

CREATE TABLE member_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  tag_key TEXT NOT NULL,
  tag_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT member_tags_member_key_unique UNIQUE (member_id, tag_key),
  CONSTRAINT member_tags_key_nonempty CHECK (length(trim(tag_key)) > 0),
  CONSTRAINT member_tags_key_len CHECK (char_length(tag_key) <= 500),
  CONSTRAINT member_tags_value_len CHECK (char_length(tag_value) <= 2000)
);

CREATE INDEX idx_member_tags_member_id ON member_tags(member_id);
CREATE INDEX idx_member_tags_key ON member_tags(tag_key);
CREATE INDEX idx_member_tags_key_value ON member_tags(tag_key, tag_value);
