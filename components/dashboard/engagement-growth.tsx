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
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
}

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

// ─── Componente ───────────────────────────────────────────────────────────────

export function EngagementGrowth({ apiSuffix = '' }: { apiSuffix?: string }) {
  const [windowMonths, setWindowMonths] = useState(6);
  const [tagFilter, setTagFilter] = useState<TagFilterState>({});
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tagFilterActive = Object.values(tagFilter).some((v) => v.length > 0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/engagement/growth?months=${windowMonths}`;
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
  }, [windowMonths, apiSuffix, tagFilter, tagFilterActive]);

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
              Como o grupo está evoluindo: pessoas novas, quem voltou e quem ficou.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void fetchData()} title="Atualizar">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {WINDOW_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={windowMonths === opt.value ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setWindowMonths(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
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

          {/* Cartões de resumo */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pessoas no grupo</CardTitle>
                <InfoTooltip content={<p>Todas as pessoas já registradas desde o início: membros (ativos e inativos) + visitantes únicos.</p>} />
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.peopleEver ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">desde o início do grupo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Visitantes únicos</CardTitle>
                <InfoTooltip content={<p>Quantas pessoas diferentes já visitaram o grupo, contadas uma vez só.</p>} />
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.uniqueVisitorsEver ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">já passaram por aqui</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Membros ativos</CardTitle>
                <InfoTooltip content={<p>Membros participantes ativos hoje.</p>} />
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.membersActive ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">fazem parte do grupo hoje</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Viraram membros</CardTitle>
                <InfoTooltip content={<p>Visitantes que se tornaram membros do grupo.</p>} />
                <Repeat className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals?.convertedTotal ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">de visitante para membro</p>
              </CardContent>
            </Card>
            <Card className={newTrend !== null && newTrend < 0 ? 'border-red-200' : 'border-green-200'}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Novos nos últimos {windowMonths} meses
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
                Quantas pessoas apareceram pela primeira vez em cada encontro.
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
                  options={barOptions}
                />
              </div>
            </CardContent>
          </Card>

          {/* Gráfico: por mês — novas, voltaram, viraram membros */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novas, voltaram e viraram membros (por mês)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pessoas novas no mês, visitantes que voltaram depois da 1ª visita e quem se tornou membro.
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
                      { label: 'Viraram membros', data: data.months.map((m) => m.conversions), type: 'line', borderColor: COLORS.violet, backgroundColor: COLORS.violet, tension: 0.3, pointRadius: 3 } as unknown as ChartDataset<'bar', number[]>,
                    ],
                  }}
                  options={monthOptions}
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
                  Em quantos dos {data.memberFrequency?.totalMeetings ?? 0} encontros do período cada membro esteve presente.
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
                      {data.memberFrequency.consideredMembers} membros ativos considerados.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem encontros no período.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visitantes novos que voltaram</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Dos visitantes que apareceram pela primeira vez neste período, quantos já voltaram pelo menos uma vez.
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
                Soma acumulada de todos os registros (membros + visitantes) mês a mês.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <Line
                  data={{
                    labels: data.cumulativeByMonth.map((m) => m.label),
                    datasets: [
                      { label: 'Pessoas no total', data: data.cumulativeByMonth.map((m) => m.total), borderColor: COLORS.blue, backgroundColor: 'rgba(37, 99, 235, 0.15)', fill: true, tension: 0.3, pointRadius: 3 },
                    ],
                  }}
                  options={lineOptions}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
