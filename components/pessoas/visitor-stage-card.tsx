'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UserCheck, ArrowRight, Loader2, XCircle } from 'lucide-react';
import { INTEGRATION_STAGE_LABELS, INTEGRATION_STAGE_COLORS, VISITOR_STATUS_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface VisitorStageCardProps {
  memberId: string;
  memberName: string;
  currentStage: string;
  markedNotReturned?: boolean;
}

const STAGE_ORDER = ['novo_visitante', 'retornou', 'integrando', 'membro'] as const;
type Stage = typeof STAGE_ORDER[number];

export function VisitorStageCard({ memberId, memberName, currentStage, markedNotReturned = false }: VisitorStageCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState<Stage | null>(null);

  const currentIdx = STAGE_ORDER.indexOf(currentStage as Stage);
  const nextStage = currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1
    ? STAGE_ORDER[currentIdx + 1]
    : null;

  const isMember = currentStage === 'membro';
  const isNovoVisitante = currentStage === 'novo_visitante';

  async function promote(targetStage: Stage) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_stage: targetStage }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erro ao atualizar estágio');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function toggleNotReturned() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marked_not_returned: !markedNotReturned }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Erro ao atualizar marcação');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <UserCheck className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-base">Estágio de Integração</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pipeline visual */}
        <div className="flex items-center gap-1 flex-wrap">
          {STAGE_ORDER.map((stage, idx) => {
            const isActive = stage === currentStage;
            const isDone = STAGE_ORDER.indexOf(currentStage as Stage) > idx;
            return (
              <div key={stage} className="flex items-center gap-1">
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                    isActive
                      ? INTEGRATION_STAGE_COLORS[stage] ?? 'bg-blue-100 text-blue-800 border-blue-200'
                      : isDone
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  )}
                >
                  {isDone && !isActive && '✓ '}
                  {INTEGRATION_STAGE_LABELS[stage] ?? stage}
                </span>
                {idx < STAGE_ORDER.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-slate-300 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {isNovoVisitante && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-col sm:flex-row gap-2 items-start">
              <Button
                size="sm"
                variant={markedNotReturned ? "destructive" : "outline"}
                disabled={loading}
                className="gap-2"
                onClick={() => toggleNotReturned()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {markedNotReturned ? "Desmarcar Não Retornou" : "Marcar como Não Retornou"}
              </Button>
              {markedNotReturned && (
                <Badge className={cn("text-xs", VISITOR_STATUS_COLORS.not_returned)}>
                  Não retornou após 3 encontros
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {markedNotReturned 
                ? "Este visitante foi marcado como não retornou. Desmarque se ele voltar a aparecer."
                : "Marque se o visitante não compareceu aos últimos encontros e não há expectativa de retorno."}
            </p>
          </div>
        )}

        {isMember ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
              ✓ Membro integrado
            </Badge>
            <p className="text-xs text-muted-foreground">
              {memberName} está totalmente integrado ao grupo.
            </p>
          </div>
        ) : nextStage ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              size="sm"
              disabled={loading}
              className="gap-2"
              onClick={() => setConfirmStage(nextStage)}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              Avançar para &quot;{INTEGRATION_STAGE_LABELS[nextStage]}&quot;
            </Button>

            {nextStage !== 'membro' && (
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                className="gap-2"
                onClick={() => setConfirmStage('membro')}
              >
                <UserCheck className="h-4 w-4" />
                Marcar como Membro diretamente
              </Button>
            )}
          </div>
        ) : null}

        {confirmStage && (
          <ConfirmDialog
            open={!!confirmStage}
            onOpenChange={(open) => { if (!open) setConfirmStage(null); }}
            title={confirmStage === 'membro' && nextStage !== 'membro'
              ? 'Converter para Membro'
              : 'Confirmar avanço de estágio'}
            description={
              confirmStage === 'membro' && nextStage !== 'membro'
                ? `Você está marcando ${memberName} como Membro diretamente, indicando que está plenamente integrado ao grupo.`
                : `Você está avançando ${memberName} de "${INTEGRATION_STAGE_LABELS[currentStage] ?? currentStage}" para "${INTEGRATION_STAGE_LABELS[confirmStage] ?? confirmStage}".`
            }
            confirmLabel="Confirmar"
            onConfirm={() => promote(confirmStage)}
          />
        )}
      </CardContent>
    </Card>
  );
}
