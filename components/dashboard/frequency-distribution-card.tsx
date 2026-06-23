'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
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
import type { MemberFilter } from '@/components/dashboard/engagement-filter-controls';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface FrequencySegment {
  segment: 'highly_engaged' | 'engaged' | 'occasional' | 'at_risk';
  label: string;
  count: number;
  percentage: number;
  benchmark: number;
  color: string;
  description: string;
  memberIds: string[];
}

interface FrequencyDistribution {
  segments: FrequencySegment[];
  total_members: number;
  avg_frequency: number;
  median_frequency: number;
  period_days: number;
}

interface FrequencyDistributionCardProps {
  memberFilter: MemberFilter;
  periodDays?: number;
}

export function FrequencyDistributionCard({ memberFilter, periodDays = 90 }: FrequencyDistributionCardProps) {
  const [data, setData] = useState<FrequencyDistribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `/api/members/frequency-distribution?period=${periodDays}&member_filter=${memberFilter}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error('Erro ao buscar distribuição de frequência:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [memberFilter, periodDays]);

  const chartData: ChartData<'bar'> = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };

    return {
      labels: data.segments.map((s) => s.label),
      datasets: [
        {
          label: 'Membros',
          data: data.segments.map((s) => s.count),
          backgroundColor: data.segments.map((s) => s.color),
          borderColor: data.segments.map((s) => s.color),
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Benchmark',
          data: data.segments.map((s) => Math.round((s.benchmark * data.total_members) / 100)),
          backgroundColor: data.segments.map((s) => s.color.replace('1)', '0.3)')),
          borderColor: data.segments.map((s) => s.color),
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false,
          borderDash: [5, 5],
        },
      ],
    };
  }, [data]);

  const chartOptions: ChartOptions<'bar'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        callbacks: {
          label: (context) => {
            const datasetLabel = context.dataset.label || '';
            const value = context.parsed.y;
            if (datasetLabel === 'Benchmark') {
              return `${datasetLabel}: ${value} (esperado)`;
            }
            const segment = data?.segments[context.dataIndex];
            return [
              `${datasetLabel}: ${value} (${segment?.percentage}%)`,
              `Faixa: ${segment?.description}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { stepSize: 1, font: { size: 10 } },
      },
    },
  }), [data]);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-5 w-5" />
            Distribuição de Frequência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  const highlyEngaged = data.segments.find((s) => s.segment === 'highly_engaged');
  const atRisk = data.segments.find((s) => s.segment === 'at_risk');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-blue-600" />
                Distribuição de Frequência
              </CardTitle>
              <InfoTooltip
                content={
                  <div>
                    <p className="font-semibold mb-1">Segmentação por Frequência</p>
                    <ul className="space-y-1 text-xs">
                      <li><span className="font-medium">Altamente Engajados:</span> ≥80% de presença</li>
                      <li><span className="font-medium">Engajados:</span> 60-79% de presença</li>
                      <li><span className="font-medium">Ocasionais:</span> 40-59% de presença</li>
                      <li><span className="font-medium">Em Risco:</span> {'<'}40% de presença</li>
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      As barras pontilhadas mostram o benchmark esperado para cada segmento.
                    </p>
                  </div>
                }
                side="right"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Segmentação de {data.total_members} {data.total_members === 1 ? 'membro' : 'membros'} por taxa de presença
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg border bg-muted/30">
            <p className="text-2xl font-bold">{data.avg_frequency}%</p>
            <p className="text-xs text-muted-foreground">Média de Frequência</p>
          </div>
          <div className="text-center p-3 rounded-lg border bg-muted/30">
            <p className="text-2xl font-bold">{data.median_frequency}%</p>
            <p className="text-xs text-muted-foreground">Mediana</p>
          </div>
        </div>

        <div className="h-[240px] rounded-lg border bg-white dark:bg-card p-2">
          <Bar data={chartData} options={chartOptions} />
        </div>

        <div className="space-y-2">
          {data.segments.map((segment) => {
            const percentageDiff = segment.percentage - segment.benchmark;
            const isAboveBenchmark = percentageDiff >= 0;
            const isSignificantDiff = Math.abs(percentageDiff) >= 5;

            return (
              <div key={segment.segment} className="flex items-center justify-between p-2 rounded-lg border">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: segment.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{segment.label}</p>
                    <p className="text-xs text-muted-foreground">{segment.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-medium">{segment.count}</p>
                    <p className="text-xs text-muted-foreground">{segment.percentage}%</p>
                  </div>
                  {isSignificantDiff && (
                    <Badge
                      variant={isAboveBenchmark ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {isAboveBenchmark ? '+' : ''}{percentageDiff}pp
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {highlyEngaged && atRisk && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
            <p className="font-medium">Análise Rápida:</p>
            <p>
              <span className="font-medium" style={{ color: highlyEngaged.color }}>
                {highlyEngaged.percentage}%
              </span>{' '}
              dos membros estão altamente engajados (meta: {highlyEngaged.benchmark}%)
            </p>
            <p>
              <span className="font-medium" style={{ color: atRisk.color }}>
                {atRisk.percentage}%
              </span>{' '}
              estão em risco (ideal: {'<'}{atRisk.benchmark}%)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
