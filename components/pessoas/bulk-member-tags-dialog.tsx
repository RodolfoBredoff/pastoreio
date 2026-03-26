'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Tags } from 'lucide-react';

interface BulkMemberTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberIds: string[];
  onApplied?: () => void;
}

export function BulkMemberTagsDialog({
  open,
  onOpenChange,
  memberIds,
  onApplied,
}: BulkMemberTagsDialogProps) {
  const reactId = useId();
  const keysListId = `${reactId}-bulk-keys`;
  const valsListId = `${reactId}-bulk-vals`;

  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [valueSuggestions, setValueSuggestions] = useState<string[]>([]);
  const [tagKey, setTagKey] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadKeys, setLoadKeys] = useState(false);

  const refreshKeys = useCallback(async () => {
    setLoadKeys(true);
    try {
      const res = await fetch('/api/member-tags/keys', { cache: 'no-store' });
      const data = res.ok ? await res.json() : { keys: [] };
      setExistingKeys(Array.isArray(data.keys) ? data.keys : []);
    } finally {
      setLoadKeys(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshKeys();
    setTagKey('');
    setTagValue('');
  }, [open, refreshKeys]);

  useEffect(() => {
    const k = tagKey.trim();
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
    }, 200);
    return () => clearTimeout(t);
  }, [tagKey]);

  const apply = async () => {
    const k = tagKey.trim();
    if (!k || memberIds.length === 0) return;
    setSaving(true);
    try {
      for (const id of memberIds) {
        const res = await fetch('/api/member-tags', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_id: id, tag_key: k, tag_value: tagValue }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert((err as { error?: string }).error ?? 'Erro ao salvar tag');
          return;
        }
      }
      onApplied?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const n = memberIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <Tags className="h-4 w-4 shrink-0" />
            Etiquetar {n} pessoa{n !== 1 ? 's' : ''}
          </DialogTitle>
        </DialogHeader>
        <datalist id={keysListId}>
          {existingKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <datalist id={valsListId}>
          {valueSuggestions.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <p className="text-sm text-muted-foreground">
          A mesma chave e valor serão aplicadas a todas as pessoas selecionadas (substitui o valor anterior dessa
          chave, se existir).
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${reactId}-bk`}>Chave</Label>
            <Input
              id={`${reactId}-bk`}
              list={keysListId}
              value={tagKey}
              onChange={(e) => setTagKey(e.target.value)}
              placeholder="Chave da tag"
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${reactId}-bv`}>Valor</Label>
            <Input
              id={`${reactId}-bv`}
              list={tagKey.trim() ? valsListId : undefined}
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="Valor (livre)"
              disabled={saving}
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshKeys()} disabled={loadKeys}>
            {loadKeys ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Atualizar sugestões
          </Button>
          <Button type="button" onClick={() => void apply()} disabled={saving || !tagKey.trim() || n === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Aplicar a {n} pessoa{n !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
