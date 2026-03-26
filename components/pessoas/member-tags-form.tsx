'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface TagRow {
  id: string;
  tag_key: string;
  tag_value: string;
}

export interface MemberTagsFormProps {
  memberId: string;
  /** Chamado após qualquer alteração (criar/editar/remover). */
  onChanged?: () => void;
  showIntro?: boolean;
}

export function MemberTagsForm({ memberId, onChanged, showIntro }: MemberTagsFormProps) {
  const reactId = useId();
  const keysListId = `${reactId}-tag-keys`;
  const newValuesListId = `${reactId}-new-tag-values`;

  const [tags, setTags] = useState<TagRow[]>([]);
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    const res = await fetch('/api/member-tags/keys', { cache: 'no-store' });
    const data = res.ok ? await res.json() : { keys: [] };
    setExistingKeys(Array.isArray(data.keys) ? data.keys : []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadKeys();
      const res = await fetch(`/api/member-tags?member_id=${encodeURIComponent(memberId)}`, {
        cache: 'no-store',
      });
      const data = res.ok ? await res.json() : { tags: [] };
      setTags(Array.isArray(data.tags) ? data.tags : []);
    } finally {
      setLoading(false);
    }
  }, [memberId, loadKeys]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const k = newKey.trim();
    if (!k) {
      setValueSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/member-tags/values?keys=${encodeURIComponent(k)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { valuesByKey: {} }))
        .then((d: { valuesByKey?: Record<string, string[]> }) => {
          const vbk = d.valuesByKey?.[k] ?? [];
          setValueSuggestions(Array.isArray(vbk) ? vbk : []);
        })
        .catch(() => setValueSuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [newKey]);

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
      onChanged?.();
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
      if (res.ok) {
        await load();
        onChanged?.();
      }
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
      if (res.ok) {
        await load();
        onChanged?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <datalist id={keysListId}>
        {existingKeys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <datalist id={newValuesListId}>
        {valueSuggestions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {showIntro && (
        <p className="text-sm text-muted-foreground">
          Etiquetas livres (chave e valor). Chaves já usadas no grupo aparecem como sugestão; você pode criar chaves
          novas à vontade. Cada pessoa tem no máximo um valor por chave.
        </p>
      )}
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
                <TagRowEditor
                  key={t.id}
                  tag={t}
                  saving={saving}
                  removingKey={removingKey}
                  onRemove={() => void removeTag(t.tag_key)}
                  onValueCommit={(v) => {
                    if (v !== t.tag_value) void updateValue(t.tag_key, v);
                  }}
                />
              ))
            )}
          </div>
          <div className="space-y-2 rounded-md border p-3 bg-muted/30">
            <p className="text-sm font-medium">Nova tag</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`${reactId}-new-key`}>Chave</Label>
                <Input
                  id={`${reactId}-new-key`}
                  list={keysListId}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Ex.: Visitou este ano"
                  disabled={saving}
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">Sugestões do grupo ou texto novo.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${reactId}-new-val`}>Valor (livre)</Label>
                <Input
                  id={`${reactId}-new-val`}
                  list={newKey.trim() ? newValuesListId : undefined}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Ex.: Sim, Não, Março…"
                  disabled={saving}
                  autoComplete="off"
                />
                {newKey.trim() && valueSuggestions.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Valores já usados nesta chave aparecem como sugestão.</p>
                )}
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

function TagRowEditor({
  tag,
  saving,
  removingKey,
  onRemove,
  onValueCommit,
}: {
  tag: TagRow;
  saving: boolean;
  removingKey: string | null;
  onRemove: () => void;
  onValueCommit: (v: string) => void;
}) {
  const rowId = useId();
  const valuesListId = `${rowId}-vals`;
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const k = tag.tag_key.trim();
    if (!k) {
      setSuggestions([]);
      return;
    }
    fetch(`/api/member-tags/values?keys=${encodeURIComponent(k)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { valuesByKey: {} }))
      .then((d: { valuesByKey?: Record<string, string[]> }) => {
        const vbk = d.valuesByKey?.[k] ?? [];
        setSuggestions(Array.isArray(vbk) ? vbk : []);
      })
      .catch(() => setSuggestions([]));
  }, [tag.tag_key]);

  return (
    <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="font-medium text-sm shrink-0 min-w-[8rem] sm:max-w-[12rem] pt-2">{tag.tag_key}</div>
      <datalist id={valuesListId}>
        {suggestions.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <Input
        key={`${tag.id}-${tag.tag_value}`}
        className="flex-1"
        list={valuesListId}
        defaultValue={tag.tag_value}
        disabled={saving}
        onBlur={(e) => onValueCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        autoComplete="off"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive shrink-0"
        disabled={removingKey === tag.tag_key}
        onClick={onRemove}
        aria-label={`Remover tag ${tag.tag_key}`}
      >
        {removingKey === tag.tag_key ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
