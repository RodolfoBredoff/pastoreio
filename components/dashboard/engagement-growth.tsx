'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartDataset,
  type ChartOptions,
  type ChartEvent,
  type ActiveElement,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Loader2, Users, UserPlus, UserCheck, TrendingUp, TrendingDown, Repeat, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PerMeetingPoint {
  meeting_id: string;
  date: string;
  label: string;
  title: string | null;
  newPeople: number;
  newMembers: number;
  newGuests: number;
  membersPresent: number;
  guestsPresent: number;
  totalPresent: number;
}

interface MonthPoint {
  month: string;
  label: string;
  newPeople: number;
  newMembers: number;
  newGuests: number;
  returnedVisitors: number;
  conversions: number;
}

interface GrowthTotals {
  peopleEver: number;
  uniqueVisitorsEver: number;
  membersAll: number;
  membersActive: number;
  convertedTotal: number;
  attendedEver: number;
  newInWindow: number;
  newInPrevWindow: number;
  returnedInWindow: number;
  conversionsInWindow: number;
}

interface GrowthData {
  windowMonths: number;
  totals: GrowthTotals;
  perMeeting: PerMeetingPoint[];
  months: MonthPoint[];
  growthTrend: {
    recentAvg: number | null;
    prevAvg: number | null;
    delta: number | null;
    recentCount: number;
    prevCount: number;
  };
  memberFrequency: {
    totalMeetings: number;
    consideredMembers: number;
    buckets: { key: string; label: string; count: number }[];
  } | null;
  newVisitorReturn: {
    newVisitors: number;
    returned: number;
    rate: number | null;
  };
  cumulativeByMonth: { month: string; label: string; total: number }[];
  availableTags: { key: string; values: string[] }[];
  tagFilterActive: boolean;
  lists: {
    peopleEver: { name: string; kind: string; active: boolean }[];
    visitors: { name: string; presences: number; firstDate: string }[];
    membersActive: string[];
    pathToMember: { name: string; kind: string; presences: number }[];
    newInWindow: { name: string; kind: string; date: string; label: string }[];
    returned: { name: string; kind: string; date: string; label: string }[];
    converted: { name: string; kind: string; date: string; label: string }[];
  };
}

type ListKey = 'peopleEver' | 'visitors' | 'membersActive' | 'pathToMember' | 'newInWindow';

type TagFilterState = Record<string, string[]>;

// ─── Opções de janela ─────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
];

const COLORS = {
  green: '#16a34a',
  blue: '#2563eb',
  amber: '#d97706',
  slate: '#94a3b8',
  violet: '#7c3aed',
  red: '#dc2626',
};

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// ─── Janela a partir dos filtros da página ────────────────────────────────────
// Traduz o filtro ativo (mês específico, trimestre, semestre, cartões de período)
// em uma janela from/to (YYYY-MM). null = sem filtro: usa os botões 3/6/12 da seção.
interface WindowSpec {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  label: string; // rótulo legível para o chip
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function ymOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ymAdd(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return ymOf(d);
}

function monthLabelLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function quarterMonths(q: string): [string, string] {
  const [year, qn] = q.split('-Q'); // "2026-Q3"
  const qi = Math.min(4, Math.max(1, Number(qn)));
  const first = `${year}-${String((qi - 1) * 3 + 1).padStart(2, '0')}`;
  const last = `${year}-${String(qi * 3).padStart(2, '0')}`;
  return [first, last];
}

function semesterMonths(s: string): [string, string] {
  const [year, sn] = s.split('-S'); // "2026-S1"
  const first = sn === '2' ? `${year}-07` : `${year}-01`;
  const last = sn === '2' ? `${year}-12` : `${year}-06`;
  return [first, last];
}

function quarterShortLabel(q: string): string {
  const [year, qn] = q.split('-Q');
  return `T${qn}/${year.slice(-2)}`;
}

function semesterShortLabel(s: string): string {
  const [year, sn] = s.split('-S');
  return `S${sn}/${year.slice(-2)}`;
}

function computeWindowSpec(
  period: string | undefined,
  monthFilter: string | null | undefined,
  quarterFilter: string[] | null | undefined,
  semesterFilter: string[] | null | undefined,
): WindowSpec | null {
  const today = new Date();
  const curYm = ymOf(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));

  // Filtro de mês específico (visão mensal): janela = só aquele mês
  if (monthFilter && YM_RE.test(monthFilter)) {
    return { from: monthFilter, to: monthFilter, label: monthLabelLong(monthFilter) };
  }

  if (period === 'quarterly') {
    if (quarterFilter && quarterFilter.length > 0) {
      const sorted = [...quarterFilter].sort();
      const [fFirst] = quarterMonths(sorted[0]);
      const [, fLast] = quarterMonths(sorted[sorted.length - 1]);
      const label = sorted.length === 1
        ? quarterShortLabel(sorted[0])
        : `${quarterShortLabel(sorted[0])} – ${quarterShortLabel(sorted[sorted.length - 1])}`;
      return { from: fFirst, to: fLast, label };
    }
    // Últimos 4 trimestres (incluindo o atual)
    const [curFirst, curLast] = quarterMonths(`${today.getUTCFullYear()}-Q${Math.floor(today.getUTCMonth() / 3) + 1}`);
    const first = ymAdd(curFirst, -9);
    return { from: first, to: curLast, label: 'Últimos 4 trimestres' };
  }

  if (period === 'semiannual') {
    if (semesterFilter && semesterFilter.length > 0) {
      const sorted = [...semesterFilter].sort();
      const [fFirst] = semesterMonths(sorted[0]);
      const [, fLast] = semesterMonths(sorted[sorted.length - 1]);
      const label = sorted.length === 1
        ? semesterShortLabel(sorted[0])
        : `${semesterShortLabel(sorted[0])} – ${semesterShortLabel(sorted[sorted.length - 1])}`;
      return { from: fFirst, to: fLast, label };
    }
    // Últimos 4 semestres (incluindo o atual)
    const curSemFirst = today.getUTCMonth() < 6 ? `${today.getUTCFullYear()}-01` : `${today.getUTCFullYear()}-07`;
    const first = ymAdd(curSemFirst, -18);
    const last = ymAdd(curSemFirst, 5);
    return { from: first, to: last, label: 'Últimos 4 semestres' };
  }

  if (period === 'yearly') {
    return { from: `${today.getUTCFullYear() - 2}-01`, to: curYm, label: 'Últimos 3 anos' };
  }

  if (period === 'weekly') {
    const eightWeeksAgo = new Date(today.getTime() - 8 * 7 * 24 * 3600 * 1000);
    return { from: ymOf(new Date(Date.UTC(eightWeeksAgo.getUTCFullYear(), eightWeeksAgo.getUTCMonth(), 1))), to: curYm, label: 'Últimas 8 semanas' };
  }

  return null; // mensal sem mês escolhido, por encontro, por nome: janela própria
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function EngagementGrowth({
  apiSuffix = '',
  period,
  monthFilter,
  quarterFilter,
  semesterFilter,
}: {
  apiSuffix?: string;
  /** Filtros da página de engajamento: quando ativos, definem a janela da seção. */
  period?: string;
  monthFilter?: string | null;
  quarterFilter?: string[] | null;
  semesterFilter?: string[] | null;
}) {
  const [windowMonths, setWindowMonths] = useState(6);
  const [tagFilter, setTagFilter] = useState<TagFilterState>({});
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState<ListKey | null>(null);
  const [chartList, setChartList] = useState<{
    title: string;
    emptyText: string;
    items: { name: string; kind: string; detail: string }[];
  } | null>(null);

  // Plugin simples: desenha o valor acima de cada ponto/barrinha
  const valueLabelsPlugin = useMemo(
    () => ({
      id: 'growthValueLabels',
      afterDatasetsDraw: (chart: { ctx: CanvasRenderingContext2D; data: { datasets: { data: (number | null)[] }[] }; getDatasetMeta: (i: number) => { hidden?: boolean; data: { x: number; y: number }[] } }) => {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, i) => {
          const meta = chart.getDatasetMeta(i);
          if (meta.hidden) return;
          meta.data.forEach((el, j) => {
            const val = ds.data[j];
            if (val == null) return;
            ctx.save();
            ctx.font = '600 10px system-ui, sans-serif';
            ctx.fillStyle = '#334155';
            ctx.textAlign = 'center';
            ctx.fillText(String(val), el.x, el.y - 6);
            ctx.restore();
          });
        });
      },
    }),
    []
  );

  const tagFilterActive = Object.values(tagFilter).some((v) => v.length > 0);

  const windowSpec = useMemo(
    () => computeWindowSpec(period, monthFilter, quarterFilter, semesterFilter),
    [period, monthFilter, quarterFilter, semesterFilter]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = windowSpec
        ? `/api/engagement/growth?from_month=${windowSpec.from}&to_month=${windowSpec.to}`
        : `/api/engagement/growth?months=${windowMonths}`;
      if (apiSuffix) url += `&${apiSuffix}`;
      if (tagFilterActive) url += `&tags=${encodeURIComponent(JSON.stringify(tagFilter))}`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar dados');
      setData(json as GrowthData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [windowMonths, apiSuffix, tagFilter, tagFilterActive, windowSpec?.from, windowSpec?.to]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totals = data?.totals;

  const newTrend = useMemo(() => {
    if (!totals) return null;
    return pctChange(totals.newInWindow, totals.newInPrevWindow);
  }, [totals]);

  const toggleTagValue = (key: string, value: string) => {
    setTagFilter((prev) => {
      const next: TagFilterState = { ...prev };
      const arr = [...(next[key] ?? [])];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      if (arr.length > 0) next[key] = arr;
      else delete next[key];
      return next;
    });
  };

  const clearTagFilter = () => setTagFilter({});

  const appliedTagsCount = Object.entries(tagFilter).reduce((n, [, vals]) => n + vals.length, 0);

  // Clique nos gráficos: mostra quem está atrás de cada barra/ponto
  const handlePerMeetingClick = (_evt: ChartEvent, els: ActiveElement[]) => {
    if (!data || !els || els.length === 0) return;
    const meeting = data.perMeeting[els[0].index];
    if (!meeting) return;
    const items = data.lists.newInWindow
      .filter((p) => p.date === meeting.date)
      .map((p) => ({ name: p.name, kind: p.kind, detail: `1ª vez em ${p.label}` }));
    setChartList({
      title: `Pessoas novas — ${meeting.title ? `${meeting.title} · ` : ''}${meeting.label}`,
      emptyText: 'Nenhuma pessoa nova neste encontro.',
      items,
    });
  };

  const handleMonthClick = (_evt: ChartEvent, els: ActiveElement[]) => {
    if (!data || !els || els.length === 0) return;
    const el = els[0];
    const month = data.months[el.index];
    if (!month) return;
    const mesLabel = monthLabelLong(month.month);
    if (el.datasetIndex === 0) {
      const items = data.lists.newInWindow
        .filter((p) => p.date.slice(0, 7) === month.month)
        .map((p) => ({ name: p.name, kind: p.kind, detail: `1ª vez em ${p.label}` }));
      setChartList({ title: `Novas pessoas — ${mesLabel}`, emptyText: 'Nenhuma pessoa nova neste mês.', items });
    } else if (el.datasetIndex === 1) {
      const items = (data.lists.returned ?? [])
        .filter((p) => p.date.slice(0, 7) === month.month)
        .map((p) => ({ name: p.name, kind: p.kind, detail: `voltou em ${p.label}` }));
      setChartList({ title: `Visitantes que voltaram — ${mesLabel}`, emptyText: 'Nenhum retorno neste mês.', items });
    } else if (el.datasetIndex === 2) {
      const items = (data.lists.converted ?? [])
        .filter((p) => p.date.slice(0, 7) === month.month)
        .map((p) => ({ name: p.name, kind: p.kind, detail: `5ª presença em ${p.label}` }));
      setChartList({ title: `Viraram membros — ${mesLabel}`, emptyText: 'Ninguém completou 5 presenças neste mês.', items });
    }
  };

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
  };

  const monthOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  const lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: { x: { ticks: { font: { size: 10 } } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção + controles */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Crescimento do grupo
            </h2>
            <p className="text-sm text-muted-foreground">
              {windowSpec
                ? `Como o grupo está evoluindo em ${windowSpec.label}: pessoas novas, quem voltou e quem ficou.`
                : `Como o grupo está evoluindo nos últimos ${windowMonths} meses: pessoas novas, quem voltou e quem ficou.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void fetchData()} title="Atualizar">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {windowSpec ? (
              <Badge variant="secondary" className="h-8 whitespace-nowrap px-3 text-xs">
                Período: {windowSpec.label}
              </Badge>
            ) : (
              WINDOW_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={windowMonths === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setWindowMonths(opt.value)}
                >
                  {opt.label}
                </Button>
              ))
            )}
          </div>
        </div>

        {/* Filtro por tags */}
        {(data?.availableTags.length ?? 0) > 0 && (
          <div className="border-t pt-2">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setTagPanelOpen((o) => !o)}
            >
              {tagPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Filtrar por tags
              {appliedTagsCount > 0 && (
                <Badge variant="secondary" className="ml-1">{appliedTagsCount} ativa{appliedTagsCount !== 1 ? 's' : ''}</Badge>
              )}
            </button>
            {appliedTagsCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {Object.entries(tagFilter).map(([key, vals]) =>
                  vals.map((v) => (
                    <Badge key={`${key}:${v}`} variant="secondary" className="cursor-pointer" onClick={() => toggleTagValue(key, v)}>
                      {key}: {v} ✕
                    </Badge>
                  ))
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearTagFilter}>Limpar</Button>
              </div>
            )}
            {tagPanelOpen && (
              <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3 max-h-64 overflow-y-auto">
                {tagFilterActive && (
                  <p className="text-xs text-muted-foreground">
                    Filtros de tag se aplicam às métricas de membros (visitantes não possuem tags).
                  </p>
                )}
                {data?.availableTags.map((tag) => (
                  <div key={tag.key} className="space-y-1">
                    <p className="text-xs font-semibold">{tag.key}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tag.values.map((v) => {
                        const active = (tagFilter[tag.key] ?? []).includes(v);
                        return (
                          <Button
                            key={v}
                            variant={active ? 'default' : 'outline'}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleTagValue(tag.key, v)}
                          >
                            {v}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 border rounded-lg text-sm text-muted-foreground">{error}</div>
      ) : !data || (data.perMeeting.length === 0 && data.totals.peopleEver === 0) ? (
        <div className="text-center py-10 border rounded-lg">
          <p className="text-sm text-muted-foreground">Ainda não há pessoas registradas para mostrar aqui.</p>
        </div>
      ) : (
        <>
          {/* Destaque: o grupo está crescendo? */}
          <Card className={(() => {
            const t = data.growthTrend;
            if (t.delta === null) return '';
            return t.delta > 0 ? 'border-green-300 bg-green-50' : t.delta < 0 ? 'border-red-200 bg-red-50' : '';
          })()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                O grupo está crescendo?
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.growthTrend.delta === null ? (
                <p className="text-sm text-muted-foreground">
                  Ainda não há encontros suficientes nesta janela para comparar (precisa de pelo menos 6 encontros com registro).
                </p>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <p className="text-2xl font-bold">
                    {data.growthTrend.recentAvg} presentes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    em média nos últimos 3 encontros, contra {data.growthTrend.prevAvg} nos 3 anteriores
                    {' '}({data.growthTrend.delta !== null && data.growthTrend.delta > 0 ? '+' : ''}{data.growthTrend.delta} por encontro)
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cartões de resumo (clicáveis: mostram quem está em cada número) */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <Card
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => setOpenList('peopleEver')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pessoas no grupo</CardTitle>
                <InfoTooltip content={<p>Todas as pessoas já registradas desde o início: membros (ativos e inativos) + visitantes únicos. Clique para ver a lista.</p>} />
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.peopleEver ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">desde o início do grupo</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => setOpenList('visitors')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Visitantes únicos</CardTitle>
                <InfoTooltip content={<p>Quantas pessoas diferentes já visitaram o grupo, contadas uma vez só. Clique para ver a lista.</p>} />
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.uniqueVisitorsEver ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">já passaram por aqui</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => setOpenList('membersActive')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Membros ativos</CardTitle>
                <InfoTooltip content={<p>Membros participantes ativos hoje. Clique para ver a lista.</p>} />
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.membersActive ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">fazem parte do grupo hoje</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => setOpenList('pathToMember')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Viraram membros (ou voltaram)</CardTitle>
                <InfoTooltip content={<p>Regra reduzida: visitantes que já voltaram (2 ou mais presenças) ou que foram convertidos a membros. Clique para ver a lista.</p>} />
                <Repeat className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{data?.lists.pathToMember.length ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">de visitante para membro</p>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:border-primary/60"
              onClick={() => setOpenList('newInWindow')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {windowSpec
                    ? windowSpec.from === windowSpec.to
                      ? `Novos em ${windowSpec.label}`
                      : 'Novos no período'
                    : `Novos nos últimos ${windowMonths} meses`}
                </CardTitle>
                {newTrend !== null && (
                  newTrend >= 0
                    ? <TrendingUp className="h-4 w-4 text-green-600" />
                    : <TrendingDown className="h-4 w-4 text-red-600" />
                )}
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.newInWindow ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {newTrend === null
                    ? 'sem período anterior para comparar'
                    : windowSpec
                      ? `${newTrend >= 0 ? '+' : ''}${newTrend}% em relação ao período anterior`
                      : newTrend >= 0
                        ? `+${newTrend}% em relação aos ${windowMonths} meses anteriores`
                        : `${newTrend}% em relação aos ${windowMonths} meses anteriores`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico: novas pessoas por encontro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pessoas novas por encontro</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quantas pessoas apareceram pela primeira vez em cada encontro. Clique numa barra para ver quem são.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <Bar
                  data={{
                    labels: data.perMeeting.map((m) => m.label),
                    datasets: [
                      { label: 'Novos membros', data: data.perMeeting.map((m) => m.newMembers), backgroundColor: COLORS.blue, stack: 's' },
                      { label: 'Novos visitantes', data: data.perMeeting.map((m) => m.newGuests), backgroundColor: COLORS.green, stack: 's' },
                    ],
                  }}
                  options={{ ...barOptions, onClick: handlePerMeetingClick }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Gráfico: por mês — novas, voltaram, viraram membros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novas, voltaram e viraram membros (por mês)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pessoas novas no mês, visitantes na 2ª visita (voltaram) e quem completou 5 presenças — a régua do grupo
                para virar membro. Clique numa barra (ou no ponto roxo) para ver quem são.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <Bar
                  data={{
                    labels: data.months.map((m) => m.label),
                    datasets: [
                      { label: 'Novas pessoas', data: data.months.map((m) => m.newPeople), backgroundColor: COLORS.blue },
                      { label: 'Visitantes que voltaram', data: data.months.map((m) => m.returnedVisitors), backgroundColor: COLORS.amber },
                      { label: 'Viraram membros', data: data.months.map((m) => m.conversions), type: 'line', borderColor: COLORS.violet, backgroundColor: COLORS.violet, tension: 0.3, pointRadius: 3, pointHitRadius: 12 } as unknown as ChartDataset<'bar', number[]>,
                    ],
                  }}
                  options={{ ...monthOptions, onClick: handleMonthClick }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Gráfico: presença por encontro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Presença em cada encontro</CardTitle>
              <p className="text-sm text-muted-foreground">
                Total de presentes por encontro — para ver se o grupo está crescendo ou minguando.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <Line
                  data={{
                    labels: data.perMeeting.map((m) => m.label),
                    datasets: [
                      { label: 'Total presente', data: data.perMeeting.map((m) => m.totalPresent), borderColor: COLORS.green, backgroundColor: COLORS.green, tension: 0.3, pointRadius: 3 },
                      { label: 'Membros', data: data.perMeeting.map((m) => m.membersPresent), borderColor: COLORS.blue, backgroundColor: COLORS.blue, tension: 0.3, pointRadius: 2, borderDash: [5, 5] },
                      { label: 'Visitantes', data: data.perMeeting.map((m) => m.guestsPresent), borderColor: COLORS.amber, backgroundColor: COLORS.amber, tension: 0.3, pointRadius: 2, borderDash: [5, 5] },
                    ],
                  }}
                  options={lineOptions}
                />
              </div>
            </CardContent>
          </Card>

          {/* Frequência dos membros + retorno de visitantes novos */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Como está a frequência dos membros</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Em quantos dos {data.memberFrequency?.totalMeetings ?? 0} encontros com chamada registrada cada membro esteve presente.
                </p>
              </CardHeader>
              <CardContent>
                {data.memberFrequency ? (
                  <>
                    <div className="h-56">
                      <Bar
                        data={{
                          labels: data.memberFrequency.buckets.map((b) => b.label),
                          datasets: [
                            {
                              label: 'Pessoas',
                              data: data.memberFrequency.buckets.map((b) => b.count),
                              backgroundColor: [
                                COLORS.green,
                                COLORS.blue,
                                COLORS.amber,
                                COLORS.red,
                                COLORS.slate,
                              ],
                            },
                          ],
                        }}
                        options={{
                          ...monthOptions,
                          indexAxis: 'y' as const,
                          plugins: { legend: { display: false } },
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {data.memberFrequency.consideredMembers} membros ativos considerados — cada um medido pelos encontros desde o seu cadastro.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem encontros com chamada registrada no período.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visitantes novos que voltaram</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Dos visitantes novos do período (avulsos ou já cadastrados), quantos já voltaram pelo menos uma vez.
                </p>
              </CardHeader>
              <CardContent>
                {data.newVisitorReturn.rate === null ? (
                  <p className="text-sm text-muted-foreground">Nenhum visitante novo no período ainda.</p>
                ) : (
                  <>
                    <p className="text-4xl font-bold text-green-700">{data.newVisitorReturn.rate}%</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {data.newVisitorReturn.returned} de {data.newVisitorReturn.newVisitors}{' '}
                      {data.newVisitorReturn.newVisitors === 1 ? 'visitante novo' : 'visitantes novos'} voltaram.
                    </p>
                    <div className="mt-3 h-3 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-600"
                        style={{ width: `${Math.min(100, data.newVisitorReturn.rate)}%` }}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráfico: total de pessoas ao longo do tempo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total de pessoas ao longo do tempo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quantas pessoas já estavam registradas ao fim de cada mês (membros + visitantes). A linha sempre sobe —
                o que importa é o ritmo.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <Line
                  data={{
                    labels: data.cumulativeByMonth.map((m) => m.label),
                    datasets: [
                      { label: 'Pessoas no total', data: data.cumulativeByMonth.map((m) => m.total), borderColor: COLORS.blue, backgroundColor: 'rgba(37, 99, 235, 0.15)', fill: true, tension: 0.3, pointRadius: 4 },
                    ],
                  }}
                  options={{ ...lineOptions, plugins: { ...lineOptions.plugins, legend: { display: false } } }}
                  plugins={[valueLabelsPlugin as never]}
                />
              </div>
            </CardContent>
          </Card>

          {/* Dialog: quem está em cada número */}
          <Dialog open={openList !== null} onOpenChange={(o) => !o && setOpenList(null)}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {openList === 'peopleEver' && 'Pessoas no grupo (desde o início)'}
                  {openList === 'visitors' && 'Visitantes únicos'}
                  {openList === 'membersActive' && 'Membros ativos hoje'}
                  {openList === 'pathToMember' && 'Viraram membros (ou voltaram)'}
                  {openList === 'newInWindow' && `Novos nos últimos ${windowMonths} meses`}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                {openList === 'peopleEver' &&
                  (data.lists.peopleEver.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Ninguém registrado ainda.</p>
                  ) : (
                    data.lists.peopleEver.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm truncate">{p.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="secondary">{p.kind}</Badge>
                          {!p.active && <Badge variant="destructive">Inativo</Badge>}
                        </div>
                      </div>
                    ))
                  ))}
                {openList === 'visitors' &&
                  (data.lists.visitors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum visitante registrado ainda.</p>
                  ) : (
                    data.lists.visitors.map((v, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm truncate">{v.name}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {v.presences} presença{v.presences !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))
                  ))}
                {openList === 'membersActive' &&
                  (data.lists.membersActive.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum membro ativo.</p>
                  ) : (
                    data.lists.membersActive.map((name, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm">{name}</span>
                      </div>
                    ))
                  ))}
                {openList === 'pathToMember' &&
                  (data.lists.pathToMember.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Ninguém ainda — a lista reúne quem voltou (2+ presenças) ou virou membro.
                    </p>
                  ) : (
                    data.lists.pathToMember.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm truncate">{p.name}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {p.kind} · {p.presences} presença{p.presences !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    ))
                  ))}
                {openList === 'newInWindow' &&
                  (data.lists.newInWindow.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma pessoa nova no período.</p>
                  ) : (
                    data.lists.newInWindow.map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm truncate">{p.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="secondary">{p.kind}</Badge>
                          <span className="text-xs text-muted-foreground">1ª vez em {p.label}</span>
                        </div>
                      </div>
                    ))
                  ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* Dialog: quem está atrás da barra/ponto clicado nos gráficos */}
          <Dialog open={chartList !== null} onOpenChange={(o) => !o && setChartList(null)}>
            <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{chartList?.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-1.5">
                {chartList && (chartList.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{chartList.emptyText}</p>
                ) : (
                  chartList.items.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm">{p.name}</span>
                        {p.kind && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {p.kind}
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.detail}</span>
                    </div>
                  ))
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
