'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { Loader2, Undo2 } from 'lucide-react';

interface Evaluation {
  hasConversion: boolean;
  canUndo: boolean;
  reasons: string[];
  conversion?: { guest_full_name: string; converted_at: string; meetings_count: number };
}

/**
 * Aparece na página da pessoa quando ela veio da conversão de um visitante.
 * Mostra o botão de desfazer se for seguro; senão explica por que não dá.
 */
export function UndoConversionCard({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/members/${memberId}/undo-conversion`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Evaluation | null) => { if (!cancelled) setEv(d); })
      .catch(() => { if (!cancelled) setEv(null); });
    return () => { cancelled = true; };
  }, [memberId]);

  if (!ev?.hasConversion || !ev.conversion) return null;

  const undo = async () => {
    if (!window.confirm('Desfazer a conversão? A pessoa volta a ser visitante, com as presenças que tinha como visitante.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/members/${memberId}/undo-conversion`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; reasons?: string[] };
      if (!res.ok) throw new Error([data.error, ...(data.reasons ?? [])].filter(Boolean).join(' '));
      router.push('/pessoas');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desfazer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Veio de um visitante</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Convertida em {formatDate(ev.conversion.converted_at.slice(0, 10))}, com {ev.conversion.meetings_count}{' '}
          {ev.conversion.meetings_count === 1 ? 'presença copiada' : 'presenças copiadas'} de visitante.
        </p>
        {ev.canUndo ? (
          <Button type="button" variant="outline" size="sm" onClick={undo} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
            Desfazer conversão
          </Button>
        ) : (
          <div className="text-muted-foreground" data-testid="undo-blocked">
            <p>Não é possível desfazer automaticamente:</p>
            <ul className="list-disc pl-5">
              {ev.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        )}
        {error && <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
