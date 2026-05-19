'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, X, Trash2 } from 'lucide-react';

interface TagRow {
  id: string;
  tag_key: string;
  tag_value: string;
}

interface GroupedTag {
  key: string;
  values: Array<{ id: string; value: string }>;
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
  const [groupedTags, setGroupedTags] = useState<GroupedTag[]>([]);
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
      const loadedTags = Array.isArray(data.tags) ? data.tags : [];
      setTags(loadedTags);
      
      // Agrupar tags por chave
      const grouped = new Map<string, Array<{ id: string; value: string }>>();
      for (const tag of loadedTags) {
        if (!grouped.has(tag.tag_key)) {
          grouped.set(tag.tag_key, []);
        }
        grouped.get(tag.tag_key)!.push({ id: tag.id, value: tag.tag_value });
      }
      
      const groupedArray = Array.from(grouped.entries())
        .map(([key, values]) => ({ key, values }))
        .sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'));
      
      setGroupedTags(groupedArray);
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

  const addTagValue = async () => {
    const k = newKey.trim();
    const v = newValue.trim();
    if (!k || !v) return;
    setSaving(true);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: k, tag_value: v }),
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

  const removeTagValue = async (tagKey: string, tagValue: string) => {
    const tagToRemove = tags.find(t => t.tag_key === tagKey && t.tag_value === tagValue);
    if (!tagToRemove) return;
    
    setRemovingId(tagToRemove.id);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: tagKey, tag_value: tagValue }),
      });
      if (res.ok) {
        await load();
        onChanged?.();
      }
    } finally {
      setRemovingId(null);
    }
  };

  const removeAllTagValues = async (tagKey: string) => {
    if (!confirm(`Remover todas as tags "${tagKey}"?`)) return;
    
    setSaving(true);
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
          novas à vontade. Cada pessoa pode ter múltiplos valores por chave.
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando tags…
        </div>
      ) : (
        <>
          <div className="space-y-2 rounded-md border divide-y">
            {groupedTags.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma tag ainda.</p>
            ) : (
              groupedTags.map((group) => (
                <TagGroupEditor
                  key={group.key}
                  tagKey={group.key}
                  values={group.values}
                  memberId={memberId}
                  saving={saving}
                  removingId={removingId}
                  onRemoveValue={(value) => void removeTagValue(group.key, value)}
                  onRemoveAll={() => void removeAllTagValues(group.key)}
                  onValueAdded={() => void load().then(() => onChanged?.())}
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
                  placeholder="Ex.: Habilidade"
                  disabled={saving}
                  autoComplete="off"
                />
                <p className="text-[11px] text-muted-foreground">Sugestões do grupo ou texto novo.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${reactId}-new-val`}>Valor</Label>
                <Input
                  id={`${reactId}-new-val`}
                  list={newKey.trim() ? newValuesListId : undefined}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="Ex.: Música, Ensino…"
                  disabled={saving}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addTagValue();
                  }}
                />
                {newKey.trim() && valueSuggestions.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">Valores já usados nesta chave aparecem como sugestão.</p>
                )}
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => void addTagValue()} disabled={saving || !newKey.trim() || !newValue.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Adicionar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function TagGroupEditor({
  tagKey,
  values,
  memberId,
  saving,
  removingId,
  onRemoveValue,
  onRemoveAll,
  onValueAdded,
}: {
  tagKey: string;
  values: Array<{ id: string; value: string }>;
  memberId: string;
  saving: boolean;
  removingId: string | null;
  onRemoveValue: (value: string) => void;
  onRemoveAll: () => void;
  onValueAdded: () => void;
}) {
  const [addingValue, setAddingValue] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [addingSaving, setAddingSaving] = useState(false);
  const rowId = useId();
  const valuesListId = `${rowId}-vals`;

  useEffect(() => {
    fetch(`/api/member-tags/values?keys=${encodeURIComponent(tagKey)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { valuesByKey: {} }))
      .then((d: { valuesByKey?: Record<string, string[]> }) => {
        const vbk = d.valuesByKey?.[tagKey] ?? [];
        setSuggestions(Array.isArray(vbk) ? vbk : []);
      })
      .catch(() => setSuggestions([]));
  }, [tagKey]);

  const handleAddValue = async () => {
    const v = newValue.trim();
    if (!v) return;
    
    setAddingSaving(true);
    try {
      const res = await fetch('/api/member-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, tag_key: tagKey, tag_value: v }),
      });
      if (res.ok) {
        setNewValue('');
        setAddingValue(false);
        onValueAdded();
      }
    } finally {
      setAddingSaving(false);
    }
  };

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm shrink-0 min-w-[8rem] pt-1">{tagKey}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive h-7 -mt-1"
          disabled={saving}
          onClick={onRemoveAll}
          aria-label={`Remover todas as tags ${tagKey}`}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Remover todas
        </Button>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {values.map((val) => (
          <Badge key={val.id} variant="secondary" className="flex items-center gap-1 py-1 px-2">
            <span>{val.value}</span>
            <button
              type="button"
              className="ml-1 hover:text-destructive disabled:opacity-50"
              disabled={removingId === val.id}
              onClick={() => onRemoveValue(val.value)}
              aria-label={`Remover valor ${val.value}`}
            >
              {removingId === val.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
          </Badge>
        ))}
        
        {!addingValue ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setAddingValue(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Adicionar valor
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <datalist id={valuesListId}>
              {suggestions.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <Input
              list={valuesListId}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddValue();
                if (e.key === 'Escape') {
                  setAddingValue(false);
                  setNewValue('');
                }
              }}
              placeholder="Novo valor..."
              className="h-7 text-sm w-32"
              disabled={addingSaving}
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              className="h-7"
              onClick={() => void handleAddValue()}
              disabled={addingSaving || !newValue.trim()}
            >
              {addingSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setAddingValue(false);
                setNewValue('');
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
