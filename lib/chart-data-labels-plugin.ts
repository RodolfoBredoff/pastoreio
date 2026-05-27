import type { Chart as ChartJS } from 'chart.js';

type DataLabelFormatter = (value: number) => string;

function drawDataLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
) {
  ctx.save();
  ctx.fillStyle = '#374151';
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function createBarDataLabelsPlugin(id = 'barDataLabels', format?: DataLabelFormatter) {
  return {
    id,
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
          const label = format ? format(value) : String(value);
          const el = element as unknown as { x: number; y: number };
          if (isHorizontal) {
            drawDataLabel(ctx, label, el.x + 5, el.y, 'left', 'middle');
          } else {
            drawDataLabel(ctx, label, el.x, el.y - 4, 'center', 'bottom');
          }
        });
      });
    },
  };
}

export function createLineDataLabelsPlugin(id = 'lineDataLabels', format?: DataLabelFormatter) {
  const defaultFormat = (value: number) => `${value}%`;
  const labelFormat = format ?? defaultFormat;

  return {
    id,
    afterDatasetsDraw(chart: ChartJS) {
      const { ctx } = chart;
      chart.data.datasets.forEach((_dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        meta.data.forEach((element, index) => {
          const raw = chart.data.datasets[datasetIndex]?.data[index];
          const value = typeof raw === 'number' ? raw : 0;
          if (value <= 0) return;
          const el = element as unknown as { x: number; y: number };
          drawDataLabel(ctx, labelFormat(value), el.x, el.y - 8, 'center', 'bottom');
        });
      });
    },
  };
}
