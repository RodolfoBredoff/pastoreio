'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { MemberFilter } from '@/components/dashboard/engagement-filter-controls';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

interface RetentionMetric {
  period: '3_months' | '6_months' | '12_months';
  label: string;
  cohort_start_date: string;
  cohort_end_date: string;
  total_members: number;
  retained_members: number;
  retention_rate: number;
  churned_members: number;
  churn_rate: number;
  benchmark: number;
  health_status: 'excellent' | 'good' | 'warning' | 'critical';
}

interface RetentionAnalysis {
  metrics: RetentionMetric[];
  overall_trend: 'improving' | 'stable' | 'declining';
  avg_retention_rate: number;
}

interface RetentionMetricsCardProps {
  memberFilter: MemberFilter;
}

export function RetentionMetricsCard({ memberFilter }: RetentionMetricsCardProps) {
  const [data, setData] = useState<RetentionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `/api/engagement/retention?member_filter=${memberFilter}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error('Erro ao buscar métricas de retenção:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [memberFilter]);

  const chartData: ChartData<'line'> = useMemo(() => {
    if (!data) return { labels: [], datasets: [] };

    return {
      labels: data.metrics.map((m) => m.label),
      datasets: [
        {
          label: 'Taxa de Retenção Atual',
          data: data.metrics.map((m) => m.retention_rate),
          borderColor: 'rgba(16, 185, 129, 1)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          pointBackgroundColor: 'rgba(16, 185, 129, 1)',
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Benchmark',
          data: data.metrics.map((m) => m.benchmark),
          borderColor: 'rgba(156, 163, 175, 1)',
          backgroundColor: 'rgba(156, 163, 175, 0.1)',
          pointBackgroundColor: 'rgba(156, 163, 175, 1)',
          pointRadius: 4,
          pointHoverRadius: 6,
          borderDash: [5, 5],
          tension: 0.3,
          fill: false,
        },
      ],
    };
  }, [data]);

  const chartOptions: ChartOptions<'line'> = useMemo(() => ({
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
            const value = context.parsed.y;
            return `${context.dataset.label}: ${value}%`;
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
        max: 100,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: {
          font: { size: 10 },
          callback: (value) => `${value}%`,
        },
      },
    },
  }), []);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            Métricas de Retenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  const getTrendLabel = (trend: string) => {
    switch (trend) {
      case 'improving':
        return 'Melhorando';
      case 'declining':
        return 'Piorando';
      default:
        return 'Estável';
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-green-600 text-white';
      case 'good':
        return 'bg-blue-600 text-white';
      case 'warning':
        return 'bg-amber-600 text-white';
      case 'critical':
        return 'bg-red-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const getHealthStatusLabel = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'Excelente';
      case 'good':
        return 'Bom';
      case 'warning':
        return 'Atenção';
      case 'critical':
        return 'Crítico';
      default:
        return status;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-5 w-5 text-blue-600" />
                Métricas de Retenção
              </CardTitle>
              <InfoTooltip
                content={
                  <div>
                    <p className="font-semibold mb-1">O que é Retenção?</p>
                    <p className="mb-2">
                      Retenção mede a % de membros que entraram há X meses e continuam ativos.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Benchmarks saudáveis:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                      <li>3 meses: ≥80%</li>
                      <li>6 meses: ≥70%</li>
                      <li>12 meses: ≥60%</li>
                    </ul>
                  </div>
                }
                side="right"
              />
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Média: {data.avg_retention_rate}%
              </p>
              <div className="flex items-center gap-1">
                {getTrendIcon(data.overall_trend)}
                <span className="text-xs text-muted-foreground">
                  {getTrendLabel(data.overall_trend)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[200px] rounded-lg border bg-white dark:bg-card p-2">
          <Line data={chartData} options={chartOptions} />
        </div>

        <div className="space-y-2">
          {data.metrics.map((metric) => {
            const diff = metric.retention_rate - metric.benchmark;
            const isHealthy = metric.retention_rate >= metric.benchmark;

            return (
              <div
                key={metric.period}
                className={`p-3 rounded-lg border ${
                  metric.health_status === 'excellent'
                    ? 'border-green-200 bg-green-50/30'
                    : metric.health_status === 'good'
                      ? 'border-blue-200 bg-blue-50/30'
                      : metric.health_status === 'warning'
                        ? 'border-amber-200 bg-amber-50/30'
                        : 'border-red-200 bg-red-50/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{metric.label}</p>
                      <Badge className={`text-xs ${getHealthStatusColor(metric.health_status)}`}>
                        {getHealthStatusLabel(metric.health_status)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metric.total_members} membros no cohort
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold">{metric.retention_rate}%</p>
                    <p className="text-xs text-muted-foreground">
                      {metric.retained_members}/{metric.total_members}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Benchmark: {metric.benchmark}%
                  </span>
                  {Math.abs(diff) > 0 && (
                    <Badge variant={isHealthy ? 'default' : 'destructive'} className="text-xs">
                      {diff > 0 ? '+' : ''}{diff}pp
                    </Badge>
                  )}
                </div>
                {metric.churn_rate > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    {metric.churned_members} {metric.churned_members === 1 ? 'pessoa saiu' : 'pessoas saíram'} ({metric.churn_rate}%)
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
          <p className="font-medium">Interpretação:</p>
          {data.overall_trend === 'improving' && (
            <p className="text-green-600">
              ✓ Tendência positiva! A retenção está melhorando ao longo do tempo.
            </p>
          )}
          {data.overall_trend === 'declining' && (
            <p className="text-red-600">
              ⚠ Atenção! A retenção está caindo. Revise as práticas de acompanhamento.
            </p>
          )}
          {data.overall_trend === 'stable' && (
            <p className="text-blue-600">
              Retenção estável. Mantenha o acompanhamento consistente.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
