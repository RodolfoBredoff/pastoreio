'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Tags, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Distribution {
  tagKey: string;
  buckets: { value: string; count: number }[];
}

export function PessoasTagChartsPanel() {
  const [existingKeys, setExistingKeys] = useState<string[]>([]);
  const [chartKeys, setChartKeys] = useState<string[]>([]);
  const [customKeyInput, setCustomKeyInput] = useState('');
  const [valuesByKey, setValuesByKey] = useState<Record<string, string[]>>({});
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);

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
    const q = all.join(',');
    fetch(`/api/member-tags/values?keys=${encodeURIComponent(q)}`, { cache: 'no-store' })
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
      const res = await fetch(
        `/api/member-tags/analytics?keys=${encodeURIComponent(keysParam)}${filtersQs}`,
        { cache: 'no-store' }
      );
      const data = res.ok ? await res.json() : { distributions: [], memberCount: 0 };
      setDistributions(Array.isArray(data.distributions) ? data.distributions : []);
      setMemberCount(typeof data.memberCount === 'number' ? data.memberCount : 0);
    } finally {
      setLoadingChart(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4" />
          Gráficos por tags
        </CardTitle>
        <p className="text-sm text-muted-foreground font-normal">
          Escolha uma ou mais chaves para ver quantas pessoas há em cada valor. Use o filtro por valores para
          cruzar tags (somente quem atende a todos os filtros entra nos gráficos).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadKeys()} disabled={loadingMeta}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingMeta ? 'animate-spin' : ''}`} />
            Atualizar chaves
          </Button>
          {memberCount !== null && (
            <span className="text-xs text-muted-foreground">
              Base atual: {memberCount} pessoa{memberCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Chaves já usadas no grupo</Label>
          <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
            {loadingMeta ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : existingKeys.length === 0 ? (
              <span className="text-xs text-muted-foreground">Nenhuma ainda — cadastre na edição da pessoa.</span>
            ) : (
              existingKeys.map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant={chartKeys.includes(k) ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => (chartKeys.includes(k) ? removeChartKey(k) : addChartKey(k))}
                >
                  {k}
                </Button>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="custom-chart-key" className="text-xs">
              Outra chave (texto livre)
            </Label>
            <Input
              id="custom-chart-key"
              value={customKeyInput}
              onChange={(e) => setCustomKeyInput(e.target.value)}
              placeholder="Digite e adicione à análise"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={!customKeyInput.trim() || chartKeys.length >= 10}
            onClick={() => {
              addChartKey(customKeyInput);
              setCustomKeyInput('');
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Incluir na análise
          </Button>
        </div>

        {chartKeys.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-muted-foreground">Analisando:</span>
            {chartKeys.map((k) => (
              <Badge key={k} variant="default" className="font-normal gap-1 pr-1">
                {k}
                <button
                  type="button"
                  className="rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 ml-0.5"
                  onClick={() => removeChartKey(k)}
                  aria-label={`Remover ${k}`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}

        {chartKeys.length > 0 && (
          <div className="space-y-3 rounded-md border p-3 bg-muted/20">
            <p className="text-sm font-medium">Filtro por valores (opcional)</p>
            {loadingValues ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
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
                        <span className="font-medium text-foreground">{k}:</span> ainda sem valores salvos.
                      </p>
                    );
                  }
                  return (
                    <div key={k}>
                      <p className="text-xs font-medium mb-1">{k}</p>
                      <div className="flex flex-wrap gap-1">
                        {vals.map((v) => {
                          const on = selected.includes(v);
                          return (
                            <Button
                              key={v}
                              type="button"
                              variant={on ? 'default' : 'outline'}
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => toggleFilterValue(k, v)}
                            >
                              {v || '(vazio)'}
                            </Button>
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

        <Button type="button" onClick={() => void loadChart()} disabled={loadingChart || chartKeys.length === 0}>
          {loadingChart ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Atualizar gráficos
        </Button>

        {distributions.length > 0 && (
          <div className="space-y-6 pt-2">
            {distributions.map((dist) => (
              <div key={dist.tagKey}>
                <h4 className="text-sm font-medium mb-2">{dist.tagKey}</h4>
                {dist.buckets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem dados para esta chave.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dist.buckets} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="value" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="count" fill="hsl(215, 55%, 45%)" name="Pessoas" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
