'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LinkButton } from '@/components/ui/link-button';
import { Loader2, Plus, Tags, RefreshCw, MessageCircle, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TAG_BUCKET_SEM_TAG } from '@/lib/member-tags-filter';
import { MEMBER_TYPE_LABELS } from '@/lib/constants';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const TAG_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.85)', border: 'rgba(99, 102, 241, 1)', hover: 'rgba(79, 82, 221, 0.95)' },
  { bg: 'rgba(16, 185, 129, 0.85)', border: 'rgba(16, 185, 129, 1)', hover: 'rgba(5, 150, 105, 0.95)' },
  { bg: 'rgba(245, 158, 11, 0.85)', border: 'rgba(245, 158, 11, 1)', hover: 'rgba(217, 119, 6, 0.95)' },
  { bg: 'rgba(239, 68, 68, 0.85)', border: 'rgba(239, 68, 68, 1)', hover: 'rgba(220, 38, 38, 0.95)' },
  { bg: 'rgba(59, 130, 246, 0.85)', border: 'rgba(59, 130, 246, 1)', hover: 'rgba(37, 99, 235, 0.95)' },
  { bg: 'rgba(168, 85, 247, 0.85)', border: 'rgba(168, 85, 247, 1)', hover: 'rgba(147, 51, 234, 0.95)' },
  { bg: 'rgba(20, 184, 166, 0.85)', border: 'rgba(20, 184, 166, 1)', hover: 'rgba(13, 148, 136, 0.95)' },
  { bg: 'rgba(249, 115, 22, 0.85)', border: 'rgba(249, 115, 22, 1)', hover: 'rgba(234, 88, 12, 0.95)' },
  { bg: 'rgba(236, 72, 153, 0.85)', border: 'rgba(236, 72, 153, 1)', hover: 'rgba(219, 39, 119, 0.95)' },
  { bg: 'rgba(132, 204, 22, 0.85)', border: 'rgba(132, 204, 22, 1)', hover: 'rgba(101, 163, 13, 0.95)' },
];

const dataLabelsPlugin = {
  id: 'customDataLabels' as const,
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

interface Distribution {
  tagKey: string;
  buckets: { value: string; count: number }[];
}

export interface TagListFilterState {
  memberIds: string[];
  label: string;
}

interface ClickMapEntry {
  tagKey: string;
  bucketValue: string;
  label: string;
}

interface PessoasTagChartsPanelProps {
  tagsRefreshSignal?: number;
  onListFilterChange?: (filter: TagListFilterState | null) => void;
  onRequestBroadcast?: (memberIds: string[]) => void;
}

export function PessoasTagChartsPanel({
  tagsRefreshSignal = 0,
  onListFilterChange,
  onRequestBroadcast,
}: PessoasTagChartsPanelProps) {
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [chartKeys, setChartKeys] = useState<string[]>([]);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [valuesByKey, setValuesByKey] = useState<Record<string, string[]>>({});
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [filterMode, setFilterMode] = useState<'AND' | 'OR'>('AND');
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [membersQuery, setMembersQuery] = useState<{ keysCsv: string; filtersJson: string; mode: 'AND' | 'OR' } | null>(null);
  const [bucketDialogOpen, setBucketDialogOpen] = useState(false);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [bucketTitle, setBucketTitle] = useState('');
  const [bucketMembers, setBucketMembers] = useState<
    { id: string; full_name: string; phone: string | null; member_type: string }[]
  >([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const clickMapRef = useRef<ClickMapEntry[]>([]);

  const loadKeys = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch('/api/member-tags/keys', { cache: 'no-store' });
      const data = res.ok ? await res.json() : { keys: [] };
      setExistingKeys(Array.isArray(data.keys) ? data.keys : []);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  useEffect(() => {
    if (tagsRefreshSignal > 0) void loadKeys();
  }, [tagsRefreshSignal, loadKeys]);

  const addChartKey = (k: string) => {
    const t = k.trim();
    if (!t || chartKeys.includes(t) || chartKeys.length >= 10) return;
    setChartKeys((prev) => [...prev, t]);
  };

  const removeChartKey = (k: string) => {
    setChartKeys((prev) => prev.filter((x) => x !== k));
    setFilters((f) => {
      const next = { ...f };
      delete next[k];
      return next;
    });
  };

  useEffect(() => {
    const all = [...new Set([...chartKeys, ...Object.keys(filters).filter((k) => filters[k]?.length)])];
    if (all.length === 0) {
      setValuesByKey({});
      return;
    }
    setLoadingValues(true);
    fetch(`/api/member-tags/values?keys=${encodeURIComponent(all.join(','))}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { valuesByKey: {} }))
      .then((d: { valuesByKey?: Record<string, string[]> }) => {
        setValuesByKey(typeof d.valuesByKey === 'object' && d.valuesByKey ? d.valuesByKey : {});
      })
      .finally(() => setLoadingValues(false));
  }, [chartKeys, filters]);

  const toggleFilterValue = (tagKey: string, value: string) => {
    setFilters((prev) => {
      const cur = prev[tagKey] ?? [];
      const has = cur.includes(value);
      const nextVals = has ? cur.filter((v) => v !== value) : [...cur, value];
      const next = { ...prev };
      if (nextVals.length === 0) delete next[tagKey];
      else next[tagKey] = nextVals;
      return next;
    });
  };

  const loadChart = async () => {
    if (chartKeys.length === 0) {
      setDistributions([]);
      setMemberCount(null);
      onListFilterChange?.(null);
      return;
    }
    setLoadingChart(true);
    try {
      const keysParam = chartKeys.join(',');
      const filterPayload: Record<string, string[]> = {};
      for (const [k, vals] of Object.entries(filters)) {
        if (vals?.length) filterPayload[k] = vals;
      }
      const filtersQs =
        Object.keys(filterPayload).length > 0
          ? `&filters=${encodeURIComponent(JSON.stringify(filterPayload))}`
          : '';
      const modeQs = `&mode=${filterMode}`;
      const res = await fetch(
        `/api/member-tags/analytics?keys=${encodeURIComponent(keysParam)}${filtersQs}${modeQs}`,
        { cache: 'no-store' }
      );
      const data = res.ok ? await res.json() : { distributions: [], memberCount: 0 };
      setDistributions(Array.isArray(data.distributions) ? data.distributions : []);
      setMemberCount(typeof data.memberCount === 'number' ? data.memberCount : 0);
      const query = {
        keysCsv: keysParam,
        filtersJson: Object.keys(filterPayload).length > 0 ? JSON.stringify(filterPayload) : '',
        mode: filterMode,
      };
      setMembersQuery(query);
      if (Object.keys(filterPayload).length > 0) {
        void applyListFilter(query);
      } else {
        onListFilterChange?.(null);
      }
    } finally {
      setLoadingChart(false);
    }
  };

  const fetchFilteredMemberIds = useCallback(
    async (
      query: { keysCsv: string; filtersJson: string; mode: 'AND' | 'OR' },
      bucket?: { tagKey: string; bucket: string }
    ): Promise<{ ids: string[]; label: string }> => {
      const params = new URLSearchParams();
      params.set('keys', query.keysCsv);
      if (query.filtersJson) params.set('filters', query.filtersJson);
      params.set('mode', query.mode);
      if (bucket) {
        params.set('tag_key', bucket.tagKey);
        params.set('bucket', bucket.bucket);
      }
      const res = await fetch(`/api/member-tags/members?${params.toString()}`, { cache: 'no-store' });
      const data = res.ok ? await res.json() : { members: [] };
      const list = Array.isArray(data.members) ? data.members : [];
      const ids = list.map((m: { id: string }) => m.id);
      if (bucket) {
        const bucketLabel =
          bucket.bucket === TAG_BUCKET_SEM_TAG
            ? 'sem esta tag'
            : bucket.bucket === ''
              ? '(valor vazio)'
              : bucket.bucket;
        return { ids, label: `${bucket.tagKey}: ${bucketLabel}` };
      }
      const modeLabel = query.mode === 'AND' ? 'todas as tags' : 'pelo menos uma tag';
      return { ids, label: `Filtro de tags (${modeLabel})` };
    },
    []
  );

  const applyListFilter = useCallback(
    async (
      query: { keysCsv: string; filtersJson: string; mode: 'AND' | 'OR' },
      bucket?: { tagKey: string; bucket: string }
    ) => {
      if (!onListFilterChange) return;
      const { ids, label } = await fetchFilteredMemberIds(query, bucket);
      onListFilterChange(ids.length > 0 ? { memberIds: ids, label } : null);
    },
    [fetchFilteredMemberIds, onListFilterChange]
  );

  const openBucketMembers = async (tagKey: string, bucketValue: string) => {
    if (!membersQuery) return;
    const displayLabel =
      bucketValue === TAG_BUCKET_SEM_TAG
        ? 'sem esta tag'
        : bucketValue === ''
          ? '(valor vazio)'
          : bucketValue;
    setBucketTitle(`${tagKey} — ${displayLabel}`);
    setBucketDialogOpen(true);
    setBucketLoading(true);
    setBucketMembers([]);
    try {
      const params = new URLSearchParams();
      params.set('keys', membersQuery.keysCsv);
      params.set('tag_key', tagKey);
      params.set('bucket', bucketValue);
      if (membersQuery.filtersJson) params.set('filters', membersQuery.filtersJson);
      params.set('mode', membersQuery.mode);
      const res = await fetch(`/api/member-tags/members?${params.toString()}`, { cache: 'no-store' });
      const data = res.ok ? await res.json() : { members: [] };
      setBucketMembers(Array.isArray(data.members) ? data.members : []);
      void applyListFilter(membersQuery, { tagKey, bucket: bucketValue });
    } finally {
      setBucketLoading(false);
    }
  };

  const buildChartData = (): { data: ChartData<'bar'>; isHorizontal: boolean } => {
    const isHorizontal = distributions.length > 1 || (distributions[0]?.buckets.length ?? 0) > 6;
    const labels: string[] = [];
    const dataValues: number[] = [];
    const backgroundColors: string[] = [];
    const hoverColors: string[] = [];
    const clickMap: ClickMapEntry[] = [];

    distributions.forEach((dist, idx) => {
      const color = TAG_COLORS[idx % TAG_COLORS.length]!;
      dist.buckets.forEach((b) => {
        const displayVal = b.value === '' ? '(vazio)' : b.value;
        labels.push(distributions.length === 1 ? displayVal : `${dist.tagKey}: ${displayVal}`);
        dataValues.push(b.count);
        backgroundColors.push(color.bg);
        hoverColors.push(color.hover);
        clickMap.push({ tagKey: dist.tagKey, bucketValue: b.value, label: `${dist.tagKey}: ${displayVal}` });
      });
    });

    clickMapRef.current = clickMap;

    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Pessoas',
            data: dataValues,
            backgroundColor: backgroundColors,
            hoverBackgroundColor: hoverColors,
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      isHorizontal,
    };
  };

  const buildChartOptions = (isHorizontal: boolean): ChartOptions<'bar'> => ({
    indexAxis: isHorizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.raw as number} pessoa${(ctx.raw as number) !== 1 ? 's' : ''}`,
          title: (items) => items[0]?.label ?? '',
        },
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#f9fafb',
        bodyColor: '#d1fae5',
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(156, 163, 175, 0.15)' },
        ticks: {
          font: { size: 11 },
          color: '#6b7280',
          maxRotation: isHorizontal ? 0 : 35,
        },
        ...(isHorizontal
          ? { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: '#6b7280' } }
          : {}),
      },
      y: {
        grid: { color: 'rgba(156, 163, 175, 0.15)' },
        ticks: { font: { size: 11 }, color: '#6b7280' },
        ...(isHorizontal ? {} : { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 }, color: '#6b7280' } }),
      },
    },
    onClick: (_event, elements) => {
      if (!elements.length || !membersQuery) return;
      const idx = elements[0]!.index;
      const entry = clickMapRef.current[idx];
      if (entry) void openBucketMembers(entry.tagKey, entry.bucketValue);
    },
    onHover: (_event, elements, chart) => {
      const canvas = chart.canvas;
      canvas.style.cursor = elements.length > 0 && membersQuery ? 'pointer' : 'default';
    },
  });

  const hasFilters = Object.keys(filters).some((k) => (filters[k]?.length ?? 0) > 0);
  const totalInChart = distributions.reduce((sum, d) => sum + d.buckets.reduce((s, b) => s + b.count, 0), 0);

  const { data: chartData, isHorizontal } = distributions.length > 0
    ? buildChartData()
    : { data: { labels: [], datasets: [] }, isHorizontal: false };

  const chartHeight = isHorizontal
    ? Math.max(200, (clickMapRef.current.length || 4) * 36 + 40)
    : 260;

  return (
    <>
      <Card className="overflow-hidden border-0 shadow-sm bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/50">
        <CardHeader className="pb-3 border-b border-border/40 bg-white/50 dark:bg-slate-900/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/40 p-1.5">
                <Tags className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              Gráficos por tags
            </CardTitle>
            <div className="flex items-center gap-2">
              {memberCount !== null && (
                <span className="text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full">
                  {memberCount} pessoa{memberCount !== 1 ? 's' : ''} na base
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void loadKeys()}
                disabled={loadingMeta}
                className="h-8 px-2"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMeta ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione chaves para visualizar a distribuição. Com múltiplas chaves, o gráfico é unificado.
            Clique em uma barra para filtrar a listagem e enviar mensagens.
          </p>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Tag key selection */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Chaves do grupo
            </Label>
            <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
              {loadingMeta ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1" />
              ) : existingKeys.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Nenhuma ainda — use Tags nos cards ou na edição da pessoa.
                </span>
              ) : (
                existingKeys.map((k) => {
                  const isActive = chartKeys.includes(k);
                  const colorIdx = chartKeys.indexOf(k);
                  const color = colorIdx >= 0 ? TAG_COLORS[colorIdx % TAG_COLORS.length] : null;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => (isActive ? removeChartKey(k) : addChartKey(k))}
                      className={`
                        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                        transition-all duration-150 border
                        ${isActive
                          ? 'border-transparent text-white shadow-sm'
                          : 'border-border bg-background hover:bg-muted text-foreground'
                        }
                      `}
                      style={isActive && color ? { backgroundColor: color.border } : {}}
                    >
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
                      )}
                      {k}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Custom key input */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="custom-chart-key" className="text-xs text-muted-foreground">
                Outra chave
              </Label>
              <Input
                id="custom-chart-key"
                value={customKeyInput}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addChartKey(customKeyInput);
                    setCustomKeyInput('');
                  }
                }}
                placeholder="Digite e pressione Enter"
                className="h-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 shrink-0"
              disabled={!customKeyInput.trim() || chartKeys.length >= 10}
              onClick={() => { addChartKey(customKeyInput); setCustomKeyInput(''); }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Selected keys */}
          {chartKeys.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground mr-1">Analisando:</span>
              {chartKeys.map((k, idx) => {
                const color = TAG_COLORS[idx % TAG_COLORS.length]!;
                return (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 text-white text-xs font-medium px-2.5 py-1 rounded-full shadow-sm"
                    style={{ backgroundColor: color.border }}
                  >
                    {k}
                    <button
                      type="button"
                      className="rounded-full hover:bg-black/20 p-0.5 ml-0.5 leading-none"
                      onClick={() => removeChartKey(k)}
                      aria-label={`Remover ${k}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Value filter (collapsible) */}
          {chartKeys.length > 0 && (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-sm"
              >
                <span className="font-medium flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  Filtrar por valores
                  {hasFilters && (
                    <Badge variant="default" className="text-[10px] h-4 px-1.5">
                      {Object.values(filters).reduce((s, arr) => s + arr.length, 0)} ativo{Object.values(filters).reduce((s, arr) => s + arr.length, 0) !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">{filtersOpen ? '▲' : '▼'}</span>
              </button>

              {filtersOpen && (
                <div className="p-3 space-y-3">
                  {hasFilters && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Modo de combinação:</span>
                      <div className="inline-flex rounded-md border bg-background overflow-hidden">
                        {(['AND', 'OR'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              filterMode === mode
                                ? 'bg-indigo-600 text-white'
                                : 'hover:bg-muted text-foreground'
                            }`}
                            onClick={() => setFilterMode(mode)}
                          >
                            {mode === 'AND' ? 'E (todas)' : 'OU (qualquer)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {loadingValues ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando valores…
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-56 overflow-y-auto">
                      {chartKeys.map((k) => {
                        const vals = valuesByKey[k] ?? [];
                        const selected = filters[k] ?? [];
                        if (vals.length === 0) {
                          return (
                            <p key={k} className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">{k}:</span> sem valores salvos.
                            </p>
                          );
                        }
                        return (
                          <div key={k}>
                            <p className="text-xs font-semibold mb-1.5 text-foreground">{k}</p>
                            <div className="flex flex-wrap gap-1">
                              {vals.map((v) => {
                                const on = selected.includes(v);
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => toggleFilterValue(k, v)}
                                    className={`
                                      text-xs px-2.5 py-1 rounded-full border transition-all duration-150
                                      ${on
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                        : 'border-border bg-background hover:bg-muted text-foreground'
                                      }
                                    `}
                                  >
                                    {v || '(vazio)'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Update button */}
          <Button
            type="button"
            onClick={() => void loadChart()}
            disabled={loadingChart || chartKeys.length === 0}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loadingChart ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            Gerar gráficos
          </Button>

          {/* Chart */}
          {distributions.length > 0 && (
            <div className="space-y-3 pt-1">
              {/* Chart header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    {distributions.length === 1
                      ? distributions[0]!.tagKey
                      : `${distributions.length} chaves analisadas`}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clique em uma barra para ver as pessoas e filtrar a lista
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                    {totalInChart} registro{totalInChart !== 1 ? 's' : ''}
                  </span>
                  {distributions.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      {distributions.map((d, idx) => {
                        const color = TAG_COLORS[idx % TAG_COLORS.length]!;
                        return (
                          <span
                            key={d.tagKey}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: color.border }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            {d.tagKey}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Chart container */}
              <div
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-border/40 p-3 shadow-sm"
                style={{ height: chartHeight }}
              >
                <Bar
                  data={chartData}
                  options={buildChartOptions(isHorizontal)}
                  plugins={[dataLabelsPlugin]}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bucket members dialog */}
      <Dialog open={bucketDialogOpen} onOpenChange={setBucketDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left text-base">{bucketTitle}</DialogTitle>
          </DialogHeader>
          {bucketLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
            </div>
          ) : bucketMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma pessoa neste grupo.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  {bucketMembers.length} pessoa{bucketMembers.length !== 1 ? 's' : ''}
                </span>
                {onRequestBroadcast && bucketMembers.some((m) => m.phone) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => {
                      setBucketDialogOpen(false);
                      const ids = bucketMembers.filter((m) => m.phone).map((m) => m.id);
                      onRequestBroadcast(ids);
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Enviar mensagem em grupo
                  </Button>
                )}
              </div>
              <ul className="space-y-2">
                {bucketMembers.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {MEMBER_TYPE_LABELS[m.member_type as keyof typeof MEMBER_TYPE_LABELS] ?? m.member_type}
                        {m.phone ? ` · ${m.phone}` : ' · sem telefone'}
                      </p>
                    </div>
                    <LinkButton href={`/pessoas/${m.id}`} variant="outline" size="sm" className="shrink-0 w-full sm:w-auto">
                      Abrir cadastro
                    </LinkButton>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
