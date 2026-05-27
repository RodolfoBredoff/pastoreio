'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Users, UserCheck, X, ArrowUpRight, MessageCircle } from 'lucide-react';
import { INTEGRATION_STAGE_LABELS, VISITOR_STATUS_LABELS } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LinkButton } from '@/components/ui/link-button';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const STAGE_COLORS: Record<string, { bg: string; border: string; hover: string; text: string }> = {
  novo_visitante: { bg: 'rgba(148, 163, 184, 0.85)', border: '#94a3b8', hover: 'rgba(100, 116, 139, 0.9)', text: '#475569' },
  retornou:       { bg: 'rgba(59, 130, 246, 0.85)',  border: '#3b82f6', hover: 'rgba(37, 99, 235, 0.9)',  text: '#1d4ed8' },
  integrando:     { bg: 'rgba(245, 158, 11, 0.85)',  border: '#f59e0b', hover: 'rgba(217, 119, 6, 0.9)',  text: '#b45309' },
  membro:         { bg: 'rgba(16, 185, 129, 0.85)',  border: '#10b981', hover: 'rgba(5, 150, 105, 0.9)',  text: '#065f46' },
  nao_retornou:   { bg: 'rgba(239, 68, 68, 0.85)',   border: '#ef4444', hover: 'rgba(220, 38, 38, 0.9)',  text: '#b91c1c' },
  nao_participou_ano: { bg: 'rgba(249, 115, 22, 0.85)', border: '#f97316', hover: 'rgba(234, 88, 12, 0.9)', text: '#c2410c' },
};

const dataLabelsPlugin = {
  id: 'stagesDataLabels' as const,
  afterDatasetsDraw(chart: ChartJS) {
    const { ctx } = chart;
    const isHorizontal = chart.options.indexAxis === 'y';
    chart.data.datasets.forEach((_dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      meta.data.forEach((element, index) => {
        const raw = chart.data.datasets[datasetIndex]?.data[index];
        const value = typeof raw === 'number' ? raw : 0;
        if (!value) return;
        const el = element as unknown as { x: number; y: number };
        ctx.save();
        ctx.fillStyle = '#374151';
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        if (isHorizontal) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(value), el.x + 5, el.y);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(String(value), el.x, el.y - 4);
        }
        ctx.restore();
      });
    });
  },
};

interface StageStats {
  stage: string;
  count: number;
  marked_not_returned_count: number;
}

interface FunnelMetrics {
  novo_visitante: number;
  retornou: number;
  integrando: number;
  membro: number;
  nao_retornou: number;
  nao_participou_ano: number;
  taxa_retorno: number;
  taxa_integracao: number;
  taxa_conversao_membro: number;
}

interface StatsResponse {
  stageStats: StageStats[];
  funnel: FunnelMetrics;
  totalVisitors: number;
  period: string;
}

type Period = 'all' | '30' | '60' | '90';

interface MemberByStage {
  id: string;
  full_name: string;
  phone: string;
  integration_stage: string;
  marked_not_returned: boolean;
}

export interface StageListFilterState {
  memberIds: string[];
  label: string;
}

interface IntegrationStagesPanelProps {
  onListFilterChange?: (filter: StageListFilterState | null) => void;
  onRequestBroadcast?: (memberIds: string[]) => void;
}

export function IntegrationStagesPanel({ onListFilterChange, onRequestBroadcast }: IntegrationStagesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [stageMembers, setStageMembers] = useState<MemberByStage[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadStats = useCallback(async (selectedPeriod: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integration-stages/stats?period=${selectedPeriod}`, { cache: 'no-store' });
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats(period);
    onListFilterChange?.(null);
  }, [period, loadStats, onListFilterChange]);

  const loadMembersByStage = useCallback(async (stage: string) => {
    setLoadingMembers(true);
    setSelectedStage(stage);
    setDialogOpen(true);
    try {
      const res = await fetch(`/api/integration-stages/members?stage=${stage}&period=${period}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const list: MemberByStage[] = data.members || [];
        setStageMembers(list);
        const stageLabel =
          stage === 'nao_retornou'
            ? VISITOR_STATUS_LABELS.not_returned
            : stage === 'nao_participou_ano'
              ? VISITOR_STATUS_LABELS.not_participated_year
              : INTEGRATION_STAGE_LABELS[stage] ?? stage;
        onListFilterChange?.({
          memberIds: list.map((m) => m.id),
          label: `Estágio: ${stageLabel}`,
        });
      }
    } catch (error) {
      console.error('Erro ao buscar membros:', error);
    } finally {
      setLoadingMembers(false);
    }
  }, [period, onListFilterChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-10">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando estatísticas...
      </div>
    );
  }

  if (!stats || stats.stageStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">Nenhum visitante cadastrado ainda.</p>
        </CardContent>
      </Card>
    );
  }

  const funnelStages = [
    { stage: 'novo_visitante', value: stats.funnel.novo_visitante, label: INTEGRATION_STAGE_LABELS.novo_visitante },
    { stage: 'retornou',       value: stats.funnel.retornou,       label: INTEGRATION_STAGE_LABELS.retornou },
    { stage: 'integrando',     value: stats.funnel.integrando,     label: INTEGRATION_STAGE_LABELS.integrando },
    { stage: 'membro',         value: stats.funnel.membro,         label: INTEGRATION_STAGE_LABELS.membro },
    { stage: 'nao_participou_ano', value: stats.funnel.nao_participou_ano, label: VISITOR_STATUS_LABELS.not_participated_year },
  ];

  const distributionStages = [
    ...stats.stageStats.map((s) => ({ stage: s.stage, value: s.count, label: INTEGRATION_STAGE_LABELS[s.stage] || s.stage })),
    ...(stats.funnel.nao_retornou > 0 ? [{ stage: 'nao_retornou', value: stats.funnel.nao_retornou, label: VISITOR_STATUS_LABELS.not_returned }] : []),
    ...(stats.funnel.nao_participou_ano > 0 ? [{ stage: 'nao_participou_ano', value: stats.funnel.nao_participou_ano, label: VISITOR_STATUS_LABELS.not_participated_year }] : []),
  ];

  const funnelChartData: ChartData<'bar'> = {
    labels: funnelStages.map((s) => s.label),
    datasets: [{
      label: 'Pessoas',
      data: funnelStages.map((s) => s.value),
      backgroundColor: funnelStages.map((s) => STAGE_COLORS[s.stage]?.bg ?? 'rgba(156,163,175,0.7)'),
      hoverBackgroundColor: funnelStages.map((s) => STAGE_COLORS[s.stage]?.hover ?? 'rgba(107,114,128,0.9)'),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const distributionChartData: ChartData<'bar'> = {
    labels: distributionStages.map((s) => s.label),
    datasets: [{
      label: 'Pessoas',
      data: distributionStages.map((s) => s.value),
      backgroundColor: distributionStages.map((s) => STAGE_COLORS[s.stage]?.bg ?? 'rgba(156,163,175,0.7)'),
      hoverBackgroundColor: distributionStages.map((s) => STAGE_COLORS[s.stage]?.hover ?? 'rgba(107,114,128,0.9)'),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const funnelOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw as number} pessoa${(ctx.raw as number) !== 1 ? 's' : ''}`,
        },
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f9fafb',
        bodyColor: '#bfdbfe',
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(156, 163, 175, 0.15)' },
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 11 }, color: '#6b7280' },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#374151' },
      },
    },
    onClick: (_event, elements) => {
      if (!elements.length) return;
      const idx = elements[0]!.index;
      const stage = funnelStages[idx]?.stage;
      if (stage) void loadMembersByStage(stage);
    },
    onHover: (_event, elements, chart) => {
      chart.canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    },
  };

  const distributionOptions: ChartOptions<'bar'> = {
    indexAxis: 'x',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw as number} pessoa${(ctx.raw as number) !== 1 ? 's' : ''}`,
        },
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f9fafb',
        bodyColor: '#bfdbfe',
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#374151', maxRotation: 30 },
      },
      y: {
        grid: { color: 'rgba(156, 163, 175, 0.15)' },
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 11 }, color: '#6b7280' },
      },
    },
    onClick: (_event, elements) => {
      if (!elements.length) return;
      const idx = elements[0]!.index;
      const stage = distributionStages[idx]?.stage;
      if (stage) void loadMembersByStage(stage);
    },
    onHover: (_event, elements, chart) => {
      chart.canvas.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    },
  };

  const selectedStageLabel =
    selectedStage === 'nao_retornou'
      ? VISITOR_STATUS_LABELS.not_returned
      : selectedStage === 'nao_participou_ano'
        ? VISITOR_STATUS_LABELS.not_participated_year
        : selectedStage
          ? (INTEGRATION_STAGE_LABELS[selectedStage] ?? selectedStage)
          : 'Membros';

  const PERIODS: { label: string; value: Period }[] = [
    { label: 'Todos', value: 'all' },
    { label: '30 dias', value: '30' },
    { label: '60 dias', value: '60' },
    { label: '90 dias', value: '90' },
  ];

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Período:</span>
        <div className="flex gap-1.5 flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-150
                ${period === p.value
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'border-border bg-background hover:bg-muted text-foreground'
                }
              `}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadStats(period)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Loader2 className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: Users,
            label: 'Total de Visitantes',
            value: stats.totalVisitors,
            sub: null,
            color: 'slate',
          },
          {
            icon: TrendingUp,
            label: 'Taxa de Retorno',
            value: `${stats.funnel.taxa_retorno.toFixed(1)}%`,
            sub: `${stats.funnel.retornou} de ${stats.funnel.novo_visitante} voltaram`,
            color: 'blue',
          },
          {
            icon: TrendingUp,
            label: 'Taxa de Integração',
            value: `${stats.funnel.taxa_integracao.toFixed(1)}%`,
            sub: `${stats.funnel.integrando} em integração`,
            color: 'amber',
          },
          {
            icon: UserCheck,
            label: 'Taxa de Conversão',
            value: `${stats.funnel.taxa_conversao_membro.toFixed(1)}%`,
            sub: `${stats.funnel.membro} membros`,
            color: 'emerald',
          },
        ].map((kpi) => (
          <Card key={kpi.label} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate leading-tight">{kpi.label}</p>
                  <p className="text-2xl font-bold mt-1 leading-none">{kpi.value}</p>
                  {kpi.sub && <p className="text-xs text-muted-foreground mt-1 leading-tight truncate">{kpi.sub}</p>}
                </div>
                <div className={`rounded-lg p-2 flex-shrink-0 bg-${kpi.color}-100 dark:bg-${kpi.color}-900/30`}>
                  <kpi.icon className={`h-4 w-4 text-${kpi.color}-600 dark:text-${kpi.color}-400`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert for no-participation */}
      {stats.funnel.nao_participou_ano > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 cursor-pointer hover:from-orange-100 transition-colors"
          onClick={() => void loadMembersByStage('nao_participou_ano')}
        >
          <div className="rounded-full bg-orange-100 p-2 flex-shrink-0">
            <Users className="h-4 w-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-orange-900 text-sm">
              {stats.funnel.nao_participou_ano} pessoa{stats.funnel.nao_participou_ano !== 1 ? 's' : ''} sem participação em {new Date().getFullYear()}
            </h3>
            <p className="text-xs text-orange-700 mt-0.5">Clique para ver a lista completa</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
        </div>
      )}

      {/* Funnel chart */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 border-b border-border/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base">Funil de Integração</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Clique em uma barra para filtrar a listagem e enviar mensagens
              </p>
            </div>
            <span className="text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800">
              {funnelStages.reduce((s, f) => s + f.value, 0)} total
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-3 pb-4">
          <div className="w-full rounded-lg bg-white dark:bg-slate-900 p-2" style={{ height: 220 }}>
            <Bar data={funnelChartData} options={funnelOptions} plugins={[dataLabelsPlugin]} />
          </div>
        </CardContent>
      </Card>

      {/* Distribution chart */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 border-b border-border/30">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-base">Distribuição por Estágio</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats.funnel.nao_retornou > 0 && 'Inclui visitantes que não retornaram · '}
                Clique em uma barra para filtrar
              </p>
            </div>
            <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full">
              {distributionStages.reduce((s, d) => s + d.value, 0)} registros
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-3 pb-4">
          <div className="w-full rounded-lg bg-white dark:bg-slate-900 p-2" style={{ height: 250 }}>
            <Bar data={distributionChartData} options={distributionOptions} plugins={[dataLabelsPlugin]} />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 px-1">
            {distributionStages.map((s) => {
              const color = STAGE_COLORS[s.stage];
              return (
                <button
                  key={s.stage}
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => void loadMembersByStage(s.stage)}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color?.border ?? '#888' }} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Not-returned alert */}
      {stats.funnel.nao_retornou > 0 && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 cursor-pointer hover:from-red-100 transition-colors"
          onClick={() => void loadMembersByStage('nao_retornou')}
        >
          <div className="rounded-full bg-red-100 p-2 flex-shrink-0">
            <Users className="h-4 w-4 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-red-900 text-sm">
              {stats.funnel.nao_retornou} visitante{stats.funnel.nao_retornou !== 1 ? 's' : ''} marcado{stats.funnel.nao_retornou !== 1 ? 's' : ''} como "Não Retornou"
            </h4>
            <p className="text-xs text-red-700 mt-0.5">Clique para ver e enviar mensagens de contato</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
        </div>
      )}

      {/* Stage members dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="truncate">{selectedStageLabel}</span>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)} className="shrink-0 -mr-2">
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : stageMembers.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Nenhuma pessoa neste estágio
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">
                  {stageMembers.length} pessoa{stageMembers.length !== 1 ? 's' : ''} encontrada{stageMembers.length !== 1 ? 's' : ''}
                </p>
                {onRequestBroadcast && stageMembers.some((m) => m.phone) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => {
                      setDialogOpen(false);
                      const ids = stageMembers.filter((m) => m.phone).map((m) => m.id);
                      onRequestBroadcast(ids);
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Enviar mensagem em grupo
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {stageMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{member.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.phone || 'Sem telefone'}</p>
                      {member.marked_not_returned && (
                        <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Não Retornou
                        </span>
                      )}
                    </div>
                    <LinkButton href={`/pessoas/${member.id}`} variant="outline" size="sm" className="shrink-0">
                      Ver detalhes
                    </LinkButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
