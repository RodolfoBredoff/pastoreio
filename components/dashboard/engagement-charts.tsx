'use client';

import { useMemo } from 'react';
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
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { createBarDataLabelsPlugin, createLineDataLabelsPlugin } from '@/lib/chart-data-labels-plugin';
import type { PresenceFilter } from '@/components/dashboard/engagement-filter-controls';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

export interface PeriodDataPoint {
  period: string;
  periodStart: string;
  presentes: number;
  ausentes: number;
  meetingCount: number;
  taxa: number;
}

const barDataLabelsPlugin = createBarDataLabelsPlugin('engagementBarDataLabels');
const lineDataLabelsPlugin = createLineDataLabelsPlugin('engagementLineDataLabels');

const CHART_CONTAINER_CLASS =
  'rounded-lg border bg-white dark:bg-card p-2 sm:p-4';

function getBarChartBaseOptions(): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { font: { size: 10 } },
      },
    },
  };
}

function getLineChartBaseOptions(): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { font: { size: 10 } },
      },
    },
  };
}

interface PeriodChartsProps {
  data: PeriodDataPoint[];
  periodLabel: string;
  chartGranularityLabel?: string;
  onPeriodClick?: (periodData: PeriodDataPoint) => void;
  presenceFilter?: PresenceFilter;
}

export function EngagementPeriodCharts({
  data,
  periodLabel,
  chartGranularityLabel,
  onPeriodClick,
  presenceFilter,
}: PeriodChartsProps) {
  const chartSubtitle = chartGranularityLabel ?? periodLabel;

  const lineData: ChartData<'line'> = useMemo(() => ({
    labels: data.map((d) => d.period),
    datasets: [
      {
        label: 'Taxa (%)',
        data: data.map((d) => d.taxa),
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        pointBackgroundColor: 'rgba(16, 185, 129, 1)',
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
        fill: false,
      },
    ],
  }), [data]);

  const lineOptions: ChartOptions<'line'> = useMemo(() => ({
    ...getLineChartBaseOptions(),
    plugins: {
      ...getLineChartBaseOptions().plugins,
      legend: { display: false },
      tooltip: {
        ...getLineChartBaseOptions().plugins?.tooltip,
        callbacks: {
          afterLabel: (ctx) => {
            const point = data[ctx.dataIndex];
            if (!point) return '';
            return [
              `${point.meetingCount} encontro${point.meetingCount !== 1 ? 's' : ''}`,
              `✓ ${point.presentes} presença${point.presentes !== 1 ? 's' : ''}`,
              `✗ ${point.ausentes} ausência${point.ausentes !== 1 ? 's' : ''}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { ...getLineChartBaseOptions().scales?.x },
      y: {
        ...getLineChartBaseOptions().scales?.y,
        max: 100,
        ticks: {
          ...getLineChartBaseOptions().scales?.y?.ticks,
          callback: (value) => `${value}%`,
        },
      },
    },
  }), [data]);

  const barData: ChartData<'bar'> = useMemo(() => ({
    labels: data.map((d) => d.period),
    datasets: [
      {
        label: 'Presentes',
        data: data.map((d) => d.presentes),
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: 'Ausentes',
        data: data.map((d) => d.ausentes),
        backgroundColor: 'rgba(239, 68, 68, 0.85)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }), [data]);

  const barOptions: ChartOptions<'bar'> = useMemo(() => ({
    ...getBarChartBaseOptions(),
    onClick: onPeriodClick
      ? (_event, elements) => {
          if (elements.length === 0) return;
          const index = elements[0].index;
          const point = data[index];
          if (point) onPeriodClick(point);
        }
      : undefined,
    onHover: onPeriodClick
      ? (event, elements) => {
          const target = event.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
        }
      : undefined,
    plugins: {
      ...getBarChartBaseOptions().plugins,
      tooltip: {
        ...getBarChartBaseOptions().plugins?.tooltip,
        callbacks: {
          afterBody: (items) => {
            const index = items[0]?.dataIndex;
            const point = index !== undefined ? data[index] : null;
            if (!point) return '';
            return `${point.meetingCount} encontro${point.meetingCount !== 1 ? 's' : ''} · Taxa ${point.taxa}%`;
          },
        },
      },
    },
  }), [data, onPeriodClick]);

  if (data.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">Sem dados para o período selecionado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">
                Taxa de Presença — {chartSubtitle}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Percentual de presenças sobre o total de registros em cada {chartSubtitle.toLowerCase()}
              </p>
            </div>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Como é calculada?</p>
                  <p className="mb-2">Taxa = (Presenças ÷ Total de Registros) × 100</p>
                  <p className="text-muted-foreground">Os números acima de cada ponto mostram a taxa do período.</p>
                </div>
              }
              side="left"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`${CHART_CONTAINER_CLASS} h-[240px]`}>
            <Line data={lineData} options={lineOptions} plugins={[lineDataLabelsPlugin]} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base sm:text-lg">
                  Presentes × Ausentes — {chartSubtitle}
                </CardTitle>
                {presenceFilter && presenceFilter !== 'all' && (
                  <Badge variant="outline" className="text-xs">
                    Filtrado: {presenceFilter === 'absent' ? 'Faltantes' : 'Presentes'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {onPeriodClick
                  ? 'Clique nas barras para ver detalhes dos participantes'
                  : 'Comparativo de presenças e ausências por período'}
              </p>
            </div>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Como interpretar?</p>
                  <p className="mb-2">Cada presença ou ausência registrada é contabilizada individualmente por encontro.</p>
                  <p className="text-muted-foreground">Os números acima de cada barra mostram a quantidade.</p>
                </div>
              }
              side="left"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className={`${CHART_CONTAINER_CLASS} h-[240px]`}>
            <Bar data={barData} options={barOptions} plugins={[barDataLabelsPlugin]} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface MemberDistributionChartProps {
  chartData: { name: string; value: number; id?: string }[];
  isAbsences: boolean;
  chartHeight: number;
  onSelectMember: (id: string | undefined, name: string) => void;
}

export function MemberDistributionChart({
  chartData,
  isAbsences,
  chartHeight,
  onSelectMember,
}: MemberDistributionChartProps) {
  const barData: ChartData<'bar'> = useMemo(() => ({
    labels: chartData.map((d) => d.name),
    datasets: [
      {
        label: isAbsences ? 'Faltas' : 'Presenças',
        data: chartData.map((d) => d.value),
        backgroundColor: isAbsences ? 'rgba(239, 68, 68, 0.85)' : 'rgba(16, 185, 129, 0.85)',
        borderColor: isAbsences ? 'rgba(239, 68, 68, 1)' : 'rgba(16, 185, 129, 1)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }), [chartData, isAbsences]);

  const barOptions: ChartOptions<'bar'> = useMemo(() => ({
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event, elements) => {
      if (elements.length === 0) return;
      const index = elements[0].index;
      const item = chartData[index];
      if (item?.id) onSelectMember(item.id, item.name);
    },
    onHover: (event, elements) => {
      const target = event.native?.target as HTMLElement | undefined;
      if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        callbacks: {
          label: (ctx) => {
            const value = typeof ctx.raw === 'number' ? ctx.raw : 0;
            return isAbsences ? `${value} falta(s)` : `${value} presença(s)`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { stepSize: 1, font: { size: 10 } },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 } },
      },
    },
  }), [chartData, isAbsences, onSelectMember]);

  return (
    <div className={`${CHART_CONTAINER_CLASS}`} style={{ height: chartHeight, minWidth: 280 }}>
      <Bar data={barData} options={barOptions} plugins={[barDataLabelsPlugin]} />
    </div>
  );
}

interface DiscipleshipBarChartProps {
  labels: string[];
  values: number[];
}

export function DiscipleshipBarChart({ labels, values }: DiscipleshipBarChartProps) {
  const barData: ChartData<'bar'> = useMemo(() => ({
    labels,
    datasets: [
      {
        label: 'Pessoas',
        data: values,
        backgroundColor: 'rgba(59, 130, 246, 0.85)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  }), [labels, values]);

  const barOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        titleColor: '#f9fafb',
        bodyColor: '#f9fafb',
        callbacks: {
          label: (ctx) => {
            const value = typeof ctx.raw === 'number' ? ctx.raw : 0;
            return `${value} pessoa${value !== 1 ? 's' : ''}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.06)' },
        ticks: { stepSize: 1, font: { size: 10 } },
      },
    },
  };

  return (
    <div className={`${CHART_CONTAINER_CLASS} h-[220px]`}>
      <Bar data={barData} options={barOptions} plugins={[barDataLabelsPlugin]} />
    </div>
  );
}

const BREAKDOWN_LABELS: Record<string, string> = {
  weekly: 'Semana',
  monthly: 'Mês',
  quarterly: 'Trimestre',
  semiannual: 'Semestre',
  yearly: 'Ano',
};

interface PeriodSummaryBreakdownProps {
  summary: {
    totalPresentes: number;
    totalAusentes: number;
    taxaGeral: number;
    meetingCount: number;
    periodAvgRate: number;
  };
  breakdownRows: PeriodDataPoint[];
  periodLabel: string;
  breakdownGranularity: string | null;
  chartGranularity: string;
}

export function PeriodSummaryBreakdown({
  summary,
  breakdownRows,
  periodLabel,
  breakdownGranularity,
  chartGranularity,
}: PeriodSummaryBreakdownProps) {
  const subLabel = breakdownGranularity
    ? BREAKDOWN_LABELS[breakdownGranularity] ?? breakdownGranularity
    : BREAKDOWN_LABELS[chartGranularity] ?? chartGranularity;

  const showSubRows = breakdownRows.length > 0 && (
    breakdownGranularity !== null || breakdownRows.length > 1
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resumo do período — {periodLabel}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Total consolidado do filtro selecionado
          {breakdownGranularity ? `, com detalhamento por ${subLabel.toLowerCase()}` : ''}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Período</th>
                <th className="pb-2 pr-4 font-medium text-right">Encontros</th>
                <th className="pb-2 pr-4 font-medium text-right text-green-700">Presentes</th>
                <th className="pb-2 pr-4 font-medium text-right text-red-700">Ausentes</th>
                <th className="pb-2 font-medium text-right">Taxa</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-muted/40 font-semibold">
                <td className="py-2.5 pr-4">Total ({periodLabel})</td>
                <td className="py-2.5 pr-4 text-right">{summary.meetingCount}</td>
                <td className="py-2.5 pr-4 text-right text-green-700">{summary.totalPresentes}</td>
                <td className="py-2.5 pr-4 text-right text-red-700">{summary.totalAusentes}</td>
                <td className="py-2.5 text-right">{summary.taxaGeral}%</td>
              </tr>
              {showSubRows && breakdownRows.map((row) => (
                <tr key={row.periodStart} className="border-b last:border-b-0 text-muted-foreground">
                  <td className="py-2 pr-4 pl-3">{row.period}</td>
                  <td className="py-2 pr-4 text-right">{row.meetingCount}</td>
                  <td className="py-2 pr-4 text-right text-green-700">{row.presentes}</td>
                  <td className="py-2 pr-4 text-right text-red-700">{row.ausentes}</td>
                  <td className="py-2 text-right">{row.taxa}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary.periodAvgRate !== summary.taxaGeral && breakdownRows.length > 1 && (
          <p className="text-xs text-muted-foreground mt-3">
            Média aritmética por {subLabel.toLowerCase()}: {summary.periodAvgRate}% —
            pode diferir da taxa geral ({summary.taxaGeral}%) quando os períodos têm volumes diferentes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
