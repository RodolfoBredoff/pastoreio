'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, FileText, Lock } from 'lucide-react';

export interface MeetingReportData {
  report_prayer_requests?: string | null;
  report_offering?: string | null;
  report_notes?: string | null;
  report_updated_at?: string | null;
}

function formatOffering(v: string | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '';
}

/**
 * Relatório do encontro: pedidos de oração (privados), oferta e observações.
 * Use com key={meetingId} para reiniciar ao trocar de encontro.
 */
export function MeetingReport({ meetingId, initial }: { meetingId: string; initial: MeetingReportData }) {
  const hasContent = !!(initial.report_prayer_requests || initial.report_offering || initial.report_notes);
  const [open, setOpen] = useState(hasContent);
  const [prayer, setPrayer] = useState(initial.report_prayer_requests ?? '');
  const [offering, setOffering] = useState(formatOffering(initial.report_offering));
  const [notes, setNotes] = useState(initial.report_notes ?? '');
  const [savedAt, setSavedAt] = useState<string | null>(initial.report_updated_at ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/meetings/${meetingId}/report`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prayer_requests: prayer, offering, notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      setSavedAt(json.report?.report_updated_at ?? new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Relatório do encontro
          </CardTitle>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-prayer" className="flex items-center gap-1.5">
              Pedidos de oração
              <Lock className="h-3 w-3 text-muted-foreground" />
            </Label>
            <Textarea
              id="report-prayer"
              value={prayer}
              onChange={(e) => setPrayer(e.target.value)}
              placeholder="Um pedido por linha"
              rows={4}
              maxLength={4000}
            />
            <p className="text-xs text-muted-foreground">
              Visível só para líder, secretário(a) e coordenação. Nunca aparece em páginas públicas.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-offering">Oferta (R$)</Label>
            <Input
              id="report-offering"
              inputMode="decimal"
              value={offering}
              onChange={(e) => setOffering(e.target.value.replace(/[^\d,.]/g, ''))}
              placeholder="0,00"
              className="max-w-[10rem]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-notes">Observações</Label>
            <Textarea
              id="report-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Como foi o encontro, decisões, próximos passos..."
              rows={3}
              maxLength={4000}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar relatório'}
            </Button>
            {savedAt && !saving && (
              <span className="text-xs text-muted-foreground">
                Salvo em {new Date(savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
