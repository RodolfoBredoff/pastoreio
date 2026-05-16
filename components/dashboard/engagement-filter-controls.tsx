'use client';

import { Button } from '@/components/ui/button';
import { CalendarSearch, List } from 'lucide-react';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';

export type Period = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export type MemberFilter = 'total' | 'participants' | 'visitors';
export type PresenceFilter = 'all' | 'absent' | 'present';

export const PERIOD_OPTIONS: { value: Period; label: string; desc: string }[] = [
  { value: 'weekly', label: 'Semanal', desc: 'Últimas 8 semanas' },
  { value: 'monthly', label: 'Mensal', desc: 'Últimos 6 meses' },
  { value: 'quarterly', label: 'Trimestral', desc: 'Últimos 4 trimestres' },
  { value: 'semiannual', label: 'Semestral', desc: 'Últimos 4 semestres' },
  { value: 'yearly', label: 'Anual', desc: 'Últimos 3 anos' },
];

export const MEMBER_FILTER_OPTIONS: { value: MemberFilter; label: string }[] = [
  { value: 'total', label: 'Total' },
  { value: 'participants', label: 'Participantes' },
  { value: 'visitors', label: 'Visitantes' },
];

export const PRESENCE_FILTER_OPTIONS: { value: PresenceFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'absent', label: 'Faltantes' },
  { value: 'present', label: 'Presentes' },
];

// Função auxiliar para formatar label de trimestre
export function formatQuarterLabel(quarter: string): string {
  const [year, q] = quarter.split('-Q');
  const shortYear = year.slice(-2);
  return `T${q}/${shortYear}`;
}

// Função auxiliar para formatar label de semestre
export function formatSemesterLabel(semester: string): string {
  const [year, s] = semester.split('-S');
  const shortYear = year.slice(-2);
  return `S${s}/${shortYear}`;
}

export function MemberFilterSelector({
  value,
  onChange,
}: {
  value: MemberFilter;
  onChange: (v: MemberFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground mr-1">Tipo:</span>
      {MEMBER_FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function PresenceFilterSelector({
  value,
  onChange,
}: {
  value: PresenceFilter;
  onChange: (v: PresenceFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground mr-1">Exibir:</span>
      {PRESENCE_FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

export function PeriodSelector({
  selected,
  onChange,
  titleFilter,
  onTitleFilterChange,
  monthFilter,
  onMonthFilterChange,
  availableMonths,
  quarterFilter,
  onQuarterFilterChange,
  availableQuarters,
  semesterFilter,
  onSemesterFilterChange,
  availableSemesters,
}: {
  selected: Period | 'meeting' | 'title_group';
  onChange: (v: Period | 'meeting' | 'title_group') => void;
  titleFilter?: string;
  onTitleFilterChange?: (v: string) => void;
  monthFilter?: string;
  onMonthFilterChange?: (v: string) => void;
  availableMonths?: string[];
  quarterFilter?: string[];
  onQuarterFilterChange?: (v: string[]) => void;
  availableQuarters?: string[];
  semesterFilter?: string[];
  onSemesterFilterChange?: (v: string[]) => void;
  availableSemesters?: string[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <Button key={opt.value} variant={selected === opt.value ? 'default' : 'outline'} size="sm"
            onClick={() => onChange(opt.value)} className="flex flex-col h-auto py-1.5 px-3">
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs font-normal opacity-70 hidden sm:block">{opt.desc}</span>
          </Button>
        ))}
        <Button variant={selected === 'meeting' ? 'default' : 'outline'} size="sm"
          onClick={() => onChange('meeting')} className="flex flex-col h-auto py-1.5 px-3">
          <span className="font-medium flex items-center gap-1.5">
            <CalendarSearch className="h-3.5 w-3.5" />
            Por Encontro
          </span>
          <span className="text-xs font-normal opacity-70 hidden sm:block">Detalhe por data</span>
        </Button>
        <Button variant={selected === 'title_group' ? 'default' : 'outline'} size="sm"
          onClick={() => onChange('title_group')} className="flex flex-col h-auto py-1.5 px-3">
          <span className="font-medium flex items-center gap-1.5">
            <List className="h-3.5 w-3.5" />
            Por Nome
          </span>
          <span className="text-xs font-normal opacity-70 hidden sm:block">Vários do mesmo nome</span>
        </Button>
      </div>
      {selected === 'monthly' && onMonthFilterChange && availableMonths && availableMonths.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Mês:</span>
          <select
            value={monthFilter ?? ''}
            onChange={(e) => onMonthFilterChange(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[140px]"
          >
            <option value="">Todos (últimos 6 meses)</option>
            {availableMonths.map((ym) => {
              const [y, m] = ym.split('-');
              const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
              const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
              return (
                <option key={ym} value={ym}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      )}
      {selected === 'quarterly' && onQuarterFilterChange && availableQuarters && availableQuarters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Trimestres:</span>
          <div className="min-w-[200px]">
            <MultiSelect
              options={availableQuarters.map((q) => ({
                value: q,
                label: formatQuarterLabel(q),
              }))}
              selected={quarterFilter ?? []}
              onChange={onQuarterFilterChange}
              placeholder="Todos (últimos 4 trimestres)"
            />
          </div>
        </div>
      )}
      {selected === 'semiannual' && onSemesterFilterChange && availableSemesters && availableSemesters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Semestres:</span>
          <div className="min-w-[200px]">
            <MultiSelect
              options={availableSemesters.map((s) => ({
                value: s,
                label: formatSemesterLabel(s),
              }))}
              selected={semesterFilter ?? []}
              onChange={onSemesterFilterChange}
              placeholder="Todos (últimos 4 semestres)"
            />
          </div>
        </div>
      )}
      {onTitleFilterChange && selected !== 'meeting' && selected !== 'title_group' && (
        <div className="flex items-center gap-2">
          <input type="text" placeholder="Filtrar por título do encontro"
            value={titleFilter ?? ''} onChange={(e) => onTitleFilterChange(e.target.value)}
            className="flex h-9 w-full sm:max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm" />
        </div>
      )}
    </div>
  );
}
