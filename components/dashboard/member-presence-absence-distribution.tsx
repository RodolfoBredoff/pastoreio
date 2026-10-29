'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemberAttendanceStats } from '@/components/pessoas/member-attendance-stats';
import { MemberDistributionChart } from '@/components/dashboard/engagement-charts';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MemberStat {
  id?: string;
  name: string;
  type: string;
  presences: number;
  absences: number;
  taxa: number;
}

const CHART_LIMIT_OPTIONS = [5, 10, 15, 20] as const;

// ─── Ranking de presenças/faltas por pessoa ───────────────────────────────────

/**
 * "Faltas por Pessoa" / "Presenças por Pessoa": ranking com gráfico e lista,
 * clicável para abrir o histórico de presença da pessoa. Vive na página de
 * Análises avançadas (movido da página principal de engajamento para
 * condensá-la) e respeita os filtros de período/tipo/presença da página.
 */
export function MemberPresenceAbsenceDistribution({
  stats,
  groupId,
}: {
  stats: MemberStat[];
  groupId?: string | null;
}) {
  const [mode, setMode] = useState<'absences' | 'presences'>('absences');
  const [chartLimit, setChartLimit] = useState<number>(10);
  const [selectedMember, setSelectedMember] = useState<{ id: string; name: string } | null>(null);

  const fullData = [...stats]
    .map((m) => ({
      id: m.id,
      name: m.name,
      presences: m.presences,
      absences: m.absences,
    }))
    .filter((m) => (mode === 'absences' ? m.absences > 0 : m.presences > 0))
    .sort((a, b) => (mode === 'absences' ? b.absences - a.absences : b.presences - a.presences));

  const chartData = chartLimit > 0 ? fullData.slice(0, chartLimit) : fullData;
  const isAbsences = mode === 'absences';
  const barHeight = 32;
  const chartHeight = Math.max(180, chartData.length * barHeight);
  const chartContainerMaxHeight = 420;
  const chartScrollable = chartHeight > chartContainerMaxHeight;

  const handleSelectMember = (id: string | undefined, name: string) => {
    if (id) setSelectedMember({ id, name });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {isAbsences ? (
            <>
              <TrendingDown className="h-5 w-5 text-red-600" />
              Faltas por Pessoa
            </>
          ) : (
            <>
              <TrendingUp className="h-5 w-5 text-green-600" />
              Presenças por Pessoa
            </>
          )}
        </CardTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground self-center">Ordenar por:</span>
          <Button
            size="sm"
            variant={isAbsences ? 'default' : 'outline'}
            onClick={() => setMode('absences')}
          >
            Número de faltas
          </Button>
          <Button
            size="sm"
            variant={!isAbsences ? 'default' : 'outline'}
            onClick={() => setMode('presences')}
          >
            Número de presenças
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Lista em ordem decrescente, do mais {isAbsences ? 'ausente' : 'presente'} ao menos {isAbsences ? 'ausente' : 'presente'}.
          Clique no nome (lista ou gráfico) para ver em quais encontros a pessoa esteve presente ou ausente.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {fullData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dado suficiente para montar o ranking com o filtro atual.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Exibir no gráfico:</span>
              {CHART_LIMIT_OPTIONS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={chartLimit === n ? 'default' : 'outline'}
                  onClick={() => setChartLimit(n)}
                >
                  Top {n}
                </Button>
              ))}
              <Button
                size="sm"
                variant={chartLimit === 0 ? 'default' : 'outline'}
                onClick={() => setChartLimit(0)}
              >
                Todos ({fullData.length})
              </Button>
            </div>
            <div
              className="w-full overflow-x-auto"
              style={
                chartScrollable
                  ? { maxHeight: chartContainerMaxHeight, overflowY: 'auto' as const }
                  : undefined
              }
            >
              <MemberDistributionChart
                chartData={chartData.map((m) => ({
                  name: m.name,
                  value: isAbsences ? m.absences : m.presences,
                  id: m.id,
                }))}
                isAbsences={isAbsences}
                chartHeight={chartHeight}
                onSelectMember={handleSelectMember}
              />
            </div>
            <div className="space-y-0 max-h-64 overflow-y-auto rounded-md border">
              {fullData.map((m, index) => (
                <button
                  type="button"
                  key={m.id ?? m.name + index}
                  onClick={() => handleSelectMember(m.id, m.name)}
                  disabled={!m.id}
                  className={`flex w-full items-center justify-between py-2 px-3 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent ${m.id ? 'cursor-pointer' : ''} border-b last:border-b-0`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${
                        isAbsences ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm truncate">{m.name}</span>
                  </div>
                  <span
                    className={`text-sm font-medium shrink-0 ml-2 ${
                      isAbsences ? 'text-red-700' : 'text-green-700'
                    }`}
                  >
                    {isAbsences ? `${m.absences} falta${m.absences !== 1 ? 's' : ''}` : `${m.presences} presença${m.presences !== 1 ? 's' : ''}`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMember ? `Presença — ${selectedMember.name}` : 'Presença em encontros'}
            </DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <MemberAttendanceStats
              memberId={selectedMember.id}
              embedded
              groupId={groupId}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
