'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface TagRow {
  id: string;
  tag_key: string;
  tag_value: string;
}

interface MemberTagsEditorProps {
  memberId: string;
}

export function MemberTagsEditor({ memberId }: MemberTagsEditorProps) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/member-tags?member_id=${encodeURIComponent(memberId)}`, {
        cache: 'no-store',
      });
      const data = res.ok ? await res.json() : { tags: [] };
      setTags(Array.isArray(data.tags) ? data.tags : []);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTag = async () => {
    const k = newKey.trim();
    if (!k) return;
    setSaving(true);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: k, tag_value: newValue }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error ?? 'Erro ao salvar tag');
        return;
      }
      setNewKey('');
      setNewValue('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeTag = async (tagKey: string) => {
    setRemovingKey(tagKey);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: tagKey }),
      });
      if (res.ok) await load();
    } finally {
      setRemovingKey(null);
    }
  };

  const updateValue = async (tagKey: string, tagValue: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: tagKey, tag_value: tagValue }),
      });
      if (res.ok) await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Etiquetas livres (chave e valor) para classificar esta pessoa. Ex.: chave &quot;Visitou este ano&quot; e valor
        &quot;Sim&quot;. Não há limite de chaves distintas no grupo; cada pessoa tem no máximo um valor por chave.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando tags…
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-md border divide-y">
            {tags.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma tag ainda.</p>
            ) : (
              tags.map((t) => (
                <div key={t.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="font-medium text-sm shrink-0 min-w-[8rem]">{t.tag_key}</div>
                  <Input
                    key={`${t.id}-${t.tag_value}`}
                    className="flex-1"
                    defaultValue={t.tag_value}
                    disabled={saving}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== t.tag_value) void updateValue(t.tag_key, v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    disabled={removingKey === t.tag_key}
                    onClick={() => void removeTag(t.tag_key)}
                    aria-label={`Remover tag ${t.tag_key}`}
                  >
                    {removingKey === t.tag_key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2 rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium">Nova tag</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tag-key">Chave</Label>
                <Input
                  id="tag-key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Ex.: Visitou este ano"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tag-value">Valor (livre)</Label>
                <Input
                  id="tag-value"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Ex.: Sim, Não, Março…"
                  disabled={saving}
                />
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => void addTag()} disabled={saving || !newKey.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
