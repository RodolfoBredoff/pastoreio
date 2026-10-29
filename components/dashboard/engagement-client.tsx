'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Award, CalendarSearch, Loader2, Users, CheckCircle, XCircle, Star, List, Share2, Link2, Printer, HelpCircle, ChevronDown, ChevronUp, UserX } from 'lucide-react';
import {
  EngagementPeriodCharts,
  PeriodSummaryBreakdown,
  type PeriodDataPoint,
} from '@/components/dashboard/engagement-charts';
import type { MemberStat } from '@/components/dashboard/member-presence-absence-distribution';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Period, MemberFilter, PresenceFilter } from '@/components/dashboard/engagement-filter-controls';
import {
  PERIOD_OPTIONS,
  MemberFilterSelector,
  PresenceFilterSelector,
  PeriodSelector,
} from '@/components/dashboard/engagement-filter-controls';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { EngagementGrowth } from '@/components/dashboard/engagement-growth';
import Link from 'next/link';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EngagementSummary {
  totalPresentes: number;
  totalAusentes: number;
  taxaGeral: number;
  meetingCount: number;
  inactiveMemberCount: number;
  periodAvgRate: number;
}

const CHART_GRANULARITY_LABELS: Record<string, string> = {
  weekly: 'Semana',
  monthly: 'Mês',
  quarterly: 'Trimestre',
  semiannual: 'Semestre',
  yearly: 'Ano',
};

interface PresenceBreakdown {
  members: number;
  visitors: number;
  membersList: { name: string; presences: number }[];
  visitorsList: { name: string; presences: number; kind: 'cadastrado' | 'avulso' }[];
}

interface MeetingItem {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_type?: string;
  label: string;
}

interface MeetingAttendance {
  member_id: string;
  member_name: string;
  member_type: string;
  is_present: boolean;
}

interface MeetingSummary {
  total: number;
  present: number;
  absent: number;
  rate: number;
}

interface MeetingDetail {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_time: string | null;
  is_cancelled: boolean;
}

interface TitleGroup {
  title: string;
  count: number;
  latest_date: string;
}

// ─── Componentes internos ─────────────────────────────────────────────────────

function StatsCards({
  summary,
  periodData,
  perfectAttendance,
  memberStats,
  presenceFilter,
  presenceBreakdown,
  showTotals,
}: {
  summary: EngagementSummary;
  periodData: PeriodDataPoint[];
  perfectAttendance: string[];
  memberStats: MemberStat[];
  presenceFilter?: PresenceFilter;
  presenceBreakdown?: PresenceBreakdown | null;
  /** Totais de presenças/ausências só aparecem com recorte explícito
   *  (mês/trimestre/semestre selecionado) — sem filtro, o acumulado confunde. */
  showTotals: boolean;
}) {
  const [presenceListOpen, setPresenceListOpen] = useState(false);
  const trend = periodData.length >= 2
    ? periodData[periodData.length - 1].taxa - periodData[periodData.length - 2].taxa : 0;
  const totalRecords = summary.totalPresentes + summary.totalAusentes;

  return (
    <div className={`grid gap-4 grid-cols-2 ${showTotals ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4'}`}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Presença</CardTitle>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Taxa Geral do Período</p>
                  <p className="mb-2">
                    Calculada sobre todos os registros do filtro: (Presenças ÷ Total) × 100.
                    Reflete a proporção real de participação, não a média das taxas parciais.
                  </p>
                  <p className="text-muted-foreground">
                    {totalRecords > 0
                      ? `${summary.totalPresentes} presenças de ${totalRecords} registros em ${summary.meetingCount} encontro${summary.meetingCount !== 1 ? 's' : ''}`
                      : 'Sem dados suficientes para calcular'}
                  </p>
                </div>
              }
              side="right"
            />
          </div>
          {trend > 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : trend < 0 ? <TrendingDown className="h-4 w-4 text-red-600" /> : null}
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{summary.taxaGeral}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalRecords > 0
              ? `${summary.totalPresentes} de ${totalRecords} registros`
              : 'Sem registros'}
          </p>
          {periodData.length >= 2 && trend !== 0 && (
            <p className="text-xs mt-0.5">
              {trend > 0 && <span className="text-green-600">+{trend}% no último intervalo</span>}
              {trend < 0 && <span className="text-red-600">{trend}% no último intervalo</span>}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">100% Presença</CardTitle>
          <Award className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{perfectAttendance.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{perfectAttendance.length === 1 ? 'Membro destaque' : 'Membros destaque'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membros Ativos</CardTitle>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Membros com Registros</p>
                  <p className="mb-2">
                    Conta apenas membros cadastrados (participantes e visitantes cadastrados) que têm ao menos um registro de presença ou ausência no período.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Visitantes não cadastrados são contabilizados separadamente nos gráficos quando o filtro "Total" ou "Visitantes" está ativo.
                  </p>
                </div>
              }
              side="right"
            />
          </div>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{memberStats.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {presenceFilter === 'all' 
              ? 'com registros no período'
              : presenceFilter === 'absent'
                ? 'com pelo menos uma falta'
                : 'com pelo menos uma presença'}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Membros Inativos</CardTitle>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Membros Inativos</p>
                  <p className="mb-2">
                    Pessoas marcadas como inativas no painel de Pessoas. Não aparecem nas chamadas,
                    mas mantêm histórico de presença nos gráficos.
                  </p>
                </div>
              }
              side="right"
            />
          </div>
          <UserX className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{summary.inactiveMemberCount}</p>
          <p className="text-xs text-muted-foreground mt-1">inativos no grupo</p>
        </CardContent>
      </Card>
      {showTotals && (
        <>
      <Card
        className="cursor-pointer transition-colors hover:border-primary/60"
        onClick={() => setPresenceListOpen(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Presenças</CardTitle>
            <InfoTooltip
              content={
                <div>
                  <p className="font-semibold mb-1">Presenças por tipo de pessoa</p>
                  <p className="mb-2">
                    Presenças nos encontros do período filtrado, separadas entre membros cadastrados e
                    visitantes (avulsos e visitantes cadastrados). Clique para ver quem esteve presente.
                  </p>
                </div>
              }
              side="right"
            />
          </div>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">{summary.totalPresentes}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Membros: {presenceBreakdown?.members ?? 0} · Visitantes: {presenceBreakdown?.visitors ?? 0}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {summary.meetingCount} encontro{summary.meetingCount !== 1 ? 's' : ''} no período — clique para ver quem
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total de Ausências</CardTitle>
          <XCircle className="h-4 w-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-red-600">{summary.totalAusentes}</p>
          <p className="text-xs text-muted-foreground mt-1">registros de falta</p>
        </CardContent>
      </Card>
        </>
      )}

      <Dialog open={presenceListOpen} onOpenChange={setPresenceListOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quem esteve presente no período</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Membros ({presenceBreakdown?.members ?? 0} presenças)
              </p>
              {(presenceBreakdown?.membersList.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma presença de membro no período.</p>
              ) : (
                <div className="space-y-1.5">
                  {presenceBreakdown!.membersList.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <span className="truncate text-sm">{m.name}</span>
                      <Badge variant="secondary" className="shrink-0">
                        {m.presences} presença{m.presences !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Visitantes ({presenceBreakdown?.visitors ?? 0} presenças)
              </p>
              {(presenceBreakdown?.visitorsList.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma presença de visitante no período.</p>
              ) : (
                <div className="space-y-1.5">
                  {presenceBreakdown!.visitorsList.map((v, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm">{v.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {v.kind === 'cadastrado' ? 'Cadastrado' : 'Avulso'}
                        </Badge>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {v.presences} presença{v.presences !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Dialog de detalhes do período ────────────────────────────────────────────

interface PeriodMemberDetail {
  id: string;
  name: string;
  type: string;
  presenceCount: number;
  absenceCount: number;
}

interface PeriodDetailData {
  periodLabel: string;
  periodStart: string;
  meetingCount: number;
  meetings: Array<{ id: string; date: string; title: string | null }>;
  presentMembers: PeriodMemberDetail[];
  absentMembers: PeriodMemberDetail[];
  guestCount: number;
}

function PeriodDetailDialog({
  open,
  onOpenChange,
  periodData,
  apiSuffix,
  memberFilter,
  period,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodData: PeriodDataPoint | null;
  apiSuffix: string;
  memberFilter: MemberFilter;
  period: Period;
}) {
  const [detail, setDetail] = useState<PeriodDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !periodData) {
      setDetail(null);
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      try {
        let url = `/api/engagement/period-detail?period_start=${encodeURIComponent(periodData.periodStart)}&period=${period}&member_filter=${memberFilter}`;
        if (apiSuffix) url += `&${apiSuffix}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setDetail(data);
        }
      } catch (err) {
        console.error('Erro ao buscar detalhes do período:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [open, periodData, apiSuffix, memberFilter, period]);

  if (!periodData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Período: {periodData.period}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-primary">{detail.meetingCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Encontro{detail.meetingCount !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-green-600">{periodData.presentes}</p>
                  <p className="text-xs text-muted-foreground mt-1">Presença{periodData.presentes !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-2xl font-bold text-red-600">{periodData.ausentes}</p>
                  <p className="text-xs text-muted-foreground mt-1">Ausência{periodData.ausentes !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
            </div>

            {detail.meetings.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Encontros neste período</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {detail.meetings.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 py-1 border-b last:border-0 text-xs">
                        <span className="text-muted-foreground">
                          {new Date(m.date + 'T12:00:00Z').toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: 'short' 
                          })}
                        </span>
                        <span>{m.title || 'Encontro'}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    Mais Presentes ({detail.presentMembers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {detail.presentMembers.length > 0 ? (
                      detail.presentMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="flex flex-col min-w-0">
                            <p className="text-sm truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {m.presenceCount} presença{m.presenceCount !== 1 ? 's' : ''}
                              {m.absenceCount > 0 && ` · ${m.absenceCount} falta${m.absenceCount !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                            {m.type === 'participant' ? 'Membro' : 'Visitante'}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma presença registrada</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm text-red-700">
                    <XCircle className="h-4 w-4" />
                    Mais Ausentes ({detail.absentMembers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {detail.absentMembers.length > 0 ? (
                      detail.absentMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                          <div className="flex flex-col min-w-0">
                            <p className="text-sm truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {m.absenceCount} falta{m.absenceCount !== 1 ? 's' : ''}
                              {m.presenceCount > 0 && ` · ${m.presenceCount} presença${m.presenceCount !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                            {m.type === 'participant' ? 'Membro' : 'Visitante'}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhuma ausência registrada</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {detail.guestCount > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm">
                  <span className="font-medium">{detail.guestCount}</span> visitante{detail.guestCount !== 1 ? 's' : ''} não cadastrado{detail.guestCount !== 1 ? 's' : ''} neste período
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Erro ao carregar detalhes</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Visualização por encontro individual ─────────────────────────────────────

interface MeetingDetailResponse {
  meeting: MeetingDetail;
  attendance: MeetingAttendance[];
  guests?: { full_name: string; phone: string | null }[];
  summary: MeetingSummary;
}

function MeetingDetailView({ meetings, memberFilter, presenceFilter, apiSuffix }: { meetings: MeetingItem[]; memberFilter: MemberFilter; presenceFilter: PresenceFilter; apiSuffix: string }) {
  const [selectedId, setSelectedId] = useState<string>(meetings[0]?.id ?? '');
  const [detail, setDetail] = useState<MeetingDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      let url = `/api/engagement?meeting_id=${id}&member_filter=${memberFilter}`;
      if (apiSuffix) url += `&${apiSuffix}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setDetail(await res.json());
    } finally { setLoading(false); }
  }, [memberFilter, apiSuffix]);

  useEffect(() => { if (selectedId) fetchDetail(selectedId); }, [selectedId, fetchDetail]);

  if (meetings.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">Nenhum encontro com presenças registradas.</p>
      </div>
    );
  }

  const present = detail?.attendance.filter((a) => a.is_present) ?? [];
  const absent = detail?.attendance.filter((a) => !a.is_present) ?? [];
  const guests = detail?.guests ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSearch className="h-5 w-5" />Selecionar Encontro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.meeting_type === 'special_event' ? '⭐ ' : ''}{m.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>
      {loading && <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
      {!loading && detail && (
        <>
          <div className="rounded-lg border p-4 bg-muted/30">
            <h3 className="font-semibold text-lg">
              {detail.meeting.title ?? `Encontro de ${new Date(detail.meeting.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}`}
            </h3>
            <p className="text-sm text-muted-foreground">
              {new Date(detail.meeting.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {detail.meeting.meeting_time && ` às ${detail.meeting.meeting_time.substring(0, 5)}`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-green-600">{detail.summary.present}</p><p className="text-sm text-muted-foreground mt-1">Presentes</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-red-600">{detail.summary.absent}</p><p className="text-sm text-muted-foreground mt-1">Ausentes</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-indigo-600">{detail.summary.rate}%</p><p className="text-sm text-muted-foreground mt-1">Taxa</p></CardContent></Card>
          </div>
          {detail.summary.total > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium">Presença</span>
                  <span className="text-sm text-muted-foreground ml-auto">{detail.summary.present}/{detail.summary.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${detail.summary.rate}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span className="text-green-600">{detail.summary.rate}% presentes</span>
                  <span className="text-red-600">{100 - detail.summary.rate}% ausentes</span>
                </div>
              </CardContent>
            </Card>
          )}
          {(detail.attendance.length > 0 || guests.length > 0) ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(presenceFilter === 'all' || presenceFilter === 'present') && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-sm text-green-700"><CheckCircle className="h-4 w-4" />Presentes ({detail.summary.present})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {present.length > 0 ? present.map((a) => (
                        <div key={a.member_id} className="flex items-center justify-between py-1 border-b last:border-0">
                          <p className="text-sm">{a.member_name}</p>
                          <Badge variant="secondary" className="text-xs">{a.member_type === 'participant' ? 'Membro' : 'Visitante'}</Badge>
                        </div>
                      )) : null}
                      {guests.length > 0 ? guests.map((g, i) => (
                        <div key={`guest-${i}`} className="flex items-center justify-between py-1 border-b last:border-0">
                          <p className="text-sm">{g.full_name}{g.phone ? ` — ${g.phone}` : ''}</p>
                          <Badge variant="outline" className="text-xs">Visitante não cadastrado</Badge>
                        </div>
                      )) : null}
                      {present.length === 0 && guests.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum presente registrado</p> : null}
                    </div>
                  </CardContent>
                </Card>
              )}
              {(presenceFilter === 'all' || presenceFilter === 'absent') && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-sm text-red-700"><XCircle className="h-4 w-4" />Ausentes ({absent.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      {absent.length > 0 ? absent.map((a) => (
                        <div key={a.member_id} className="flex items-center justify-between py-1 border-b last:border-0">
                          <p className="text-sm">{a.member_name}</p>
                          <Badge variant="secondary" className="text-xs">{a.member_type === 'participant' ? 'Membro' : 'Visitante'}</Badge>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Nenhuma falta registrada</p>}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8 border rounded-lg">
              <p className="text-muted-foreground">Nenhuma presença registrada para este encontro.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Visualização por nome de encontro (multi-ocorrência) ─────────────────────

function TitleGroupView({ apiSuffix, memberFilter, presenceFilter, refreshKey = 0 }: { apiSuffix: string; memberFilter: MemberFilter; presenceFilter: PresenceFilter; refreshKey?: number }) {
  const [titleGroups, setTitleGroups] = useState<TitleGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<{
    title: string;
    meetings: MeetingItem[];
    memberStats: MemberStat[];
    summary: { total: number; totalPresent: number; totalAbsent: number; avgRate: number };
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    setLoadingGroups(true);
    let url = '/api/engagement?mode=title_groups';
    if (apiSuffix) url += `&${apiSuffix}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) {
          console.error('Erro ao buscar títulos:', r.status, r.statusText);
          return { titleGroups: [] };
        }
        return r.json();
      })
      .then((d) => {
        setTitleGroups(d.titleGroups ?? []);
        setLoadingGroups(false);
      })
      .catch((err) => {
        console.error('Erro ao buscar títulos de encontros:', err);
        setTitleGroups([]);
        setLoadingGroups(false);
      });
  }, [apiSuffix, refreshKey]);

  const fetchGroupDetail = useCallback(async (title: string) => {
    setLoadingDetail(true);
    try {
      let url = `/api/engagement?title_group=${encodeURIComponent(title)}&member_filter=${memberFilter}`;
      if (apiSuffix) url += `&${apiSuffix}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        console.error('Erro ao buscar detalhes do título:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({}));
        console.error('Detalhes do erro:', errorData);
        setGroupDetail(null);
        return;
      }
      const data = await res.json();
      setGroupDetail(data);
    } catch (err) {
      console.error('Erro ao buscar detalhes do título de encontro:', err);
      setGroupDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [apiSuffix, memberFilter]);

  useEffect(() => {
    if (!selectedTitle) return;
    void fetchGroupDetail(selectedTitle);
  }, [selectedTitle, memberFilter, fetchGroupDetail, refreshKey]);

  if (loadingGroups) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (titleGroups.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg">
        <p className="text-muted-foreground">Nenhum encontro com nome definido no período.</p>
        <p className="text-xs text-muted-foreground mt-1">Dê nomes aos encontros na página de Agenda para usar este filtro.</p>
      </div>
    );
  }

  const filteredStats = groupDetail
    ? presenceFilter === 'absent'
      ? groupDetail.memberStats.filter((m) => m.absences > 0)
      : presenceFilter === 'present'
        ? groupDetail.memberStats.filter((m) => m.presences > 0)
        : groupDetail.memberStats
    : [];
  const topPresent = [...filteredStats].sort((a, b) => b.presences - a.presences).slice(0, 5);
  const topAbsent = [...filteredStats].filter((m) => m.absences > 0).sort((a, b) => b.absences - a.absences).slice(0, 5);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <List className="h-5 w-5" />
            Selecionar Nome de Encontro
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {titleGroups.map((tg) => (
              <button type="button" key={tg.title} onClick={() => setSelectedTitle(tg.title)}
                className={`w-full text-left flex items-center justify-between p-3 rounded-lg border transition-colors ${selectedTitle === tg.title ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted/50'}`}>
                <div>
                  <p className="text-sm font-medium">{tg.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {tg.count} encontro{tg.count !== 1 ? 's' : ''} • Último: {new Date(tg.latest_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">{tg.count}x</Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loadingDetail && <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}

      {!loadingDetail && groupDetail && (
        <>
          <div className="rounded-lg border p-4 bg-muted/30">
            <h3 className="font-semibold text-lg">{groupDetail.title}</h3>
            <p className="text-sm text-muted-foreground">
              {groupDetail.meetings.length} encontro{groupDetail.meetings.length !== 1 ? 's' : ''} no total
              {groupDetail.meetings.length > 0 && ` · ${new Date(groupDetail.meetings[groupDetail.meetings.length - 1].meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR')} a ${new Date(groupDetail.meetings[0].meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR')}`}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-green-600">{groupDetail.summary.totalPresent}</p><p className="text-sm text-muted-foreground mt-1">Presenças</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-red-600">{groupDetail.summary.totalAbsent}</p><p className="text-sm text-muted-foreground mt-1">Faltas</p></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><p className="text-3xl font-bold text-indigo-600">{groupDetail.summary.avgRate}%</p><p className="text-sm text-muted-foreground mt-1">Taxa Média</p></CardContent></Card>
          </div>

          {filteredStats.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-green-600" />Top 5 Mais Presentes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topPresent.map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-700 font-bold text-sm shrink-0">{i + 1}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.presences} presença{m.presences !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <Badge className="bg-green-600 shrink-0">{m.taxa}%</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingDown className="h-5 w-5 text-red-600" />Top 5 Mais Ausentes</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topAbsent.map((m, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-700 font-bold text-sm shrink-0">{i + 1}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.absences} falta{m.absences !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <Badge variant="destructive" className="shrink-0">{m.taxa}%</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {groupDetail.meetings.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Encontros incluídos</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {groupDetail.meetings.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                      {m.meeting_type === 'special_event' && <Star className="h-3 w-3 text-amber-500 shrink-0" />}
                      <p className="text-sm">{new Date(m.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Compartilhamento público (só para líder, sem publicToken) ─────────────────

function EngagementShareToggle() {
  const [enabled, setEnabled] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetch('/api/groups/engagement-share')
      .then((r) => r.ok ? r.json() : { enabled: false, publicUrl: undefined })
      .then((d) => {
        setEnabled(!!d.enabled);
        setPublicUrl(d.publicUrl ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    setUpdating(true);
    try {
      const res = await fetch('/api/groups/engagement-share', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar');
      const data = await res.json();
      setEnabled(!!data.enabled);
      setPublicUrl(data.publicUrl ?? null);
    } finally {
      setUpdating(false);
    }
  };

  const copyLink = () => {
    if (publicUrl) navigator.clipboard.writeText(publicUrl);
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4" />
          Página de engajamento pública
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={enabled ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggle}
            disabled={updating}
          >
            {enabled ? 'Pública' : 'Privada'}
          </Button>
          {enabled && publicUrl && (
            <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Copiar link
            </Button>
          )}
        </div>
        {enabled && publicUrl && (
          <p className="text-xs text-muted-foreground break-all">
            Qualquer pessoa com o link pode ver o relatório de engajamento (sem login). Desative para voltar a privado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Card explicativo sobre como interpretar os dados ─────────────────────────

function DataInterpretationGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
      <CardHeader>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <CardTitle className="text-base text-blue-900 dark:text-blue-100">
              Como interpretar os dados
            </CardTitle>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          )}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Contabilização dos Registros
            </h4>
            <p className="text-blue-800 dark:text-blue-200">
              Cada presença ou ausência é contabilizada <strong>individualmente por encontro</strong>.
              Se uma pessoa participou de 3 encontros no período, ela aparece 3 vezes nos gráficos como "presente".
              Da mesma forma, se faltou em 2 encontros, aparece 2 vezes como "ausente".
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Filtros de Tipo de Membro
            </h4>
            <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
              <li>
                <strong>Total:</strong> Inclui todos os membros (participantes e visitantes) mais visitantes não cadastrados
              </li>
              <li>
                <strong>Participantes:</strong> Apenas membros marcados como "participante" (não inclui visitantes não cadastrados)
              </li>
              <li>
                <strong>Visitantes:</strong> Apenas membros marcados como "visitante" mais visitantes não cadastrados
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Visitantes Não Cadastrados
            </h4>
            <p className="text-blue-800 dark:text-blue-200">
              Visitantes que foram registrados na chamada mas não estão cadastrados como membros são contabilizados apenas como <strong>presenças</strong>.
              Eles nunca geram registros de ausência, pois não fazem parte da lista oficial de membros.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Taxa de Presença
            </h4>
            <p className="text-blue-800 dark:text-blue-200">
              Calculada como: <strong>(Presenças ÷ Total de Registros) × 100</strong>
            </p>
            <p className="text-blue-800 dark:text-blue-200 mt-1">
              Por exemplo: Se em um período houve 45 presenças e 5 ausências, a taxa será: (45 ÷ 50) × 100 = 90%
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Membros Inativos e Histórico
            </h4>
            <p className="text-blue-800 dark:text-blue-200">
              Membros excluídos (marcados como inativos) <strong>mantêm seus registros históricos</strong> de presença e ausência.
              Isso garante que os dados passados não sejam perdidos e as estatísticas permaneçam corretas.
            </p>
            <p className="text-blue-800 dark:text-blue-200 mt-2">
              Se você excluir um membro, ele:
            </p>
            <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200 text-xs mt-1 ml-2">
              <li>Não aparecerá mais na lista de membros ativos</li>
              <li>Ainda será contabilizado nos gráficos de engajamento histórico</li>
              <li>Seus registros de presença/ausência permanecerão intactos</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Períodos e Encontros
            </h4>
            <p className="text-blue-800 dark:text-blue-200">
              Um período (semanal, mensal, etc.) pode conter <strong>múltiplos encontros</strong>.
              Os dados são agregados somando todos os registros daquele período.
              Clique nas barras do gráfico "Presentes × Ausentes" para ver os detalhes de cada período.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface EngagementClientProps {
  groupId?: string | null;
  publicToken?: string | null;
}

export function EngagementClient({ groupId, publicToken }: EngagementClientProps = {}) {
  const apiSuffix = publicToken
    ? `public_token=${encodeURIComponent(publicToken)}`
    : (groupId ? `group_id=${groupId}` : '');

  const [groupName, setGroupName] = useState<string | null>(null);
  const [view, setView] = useState<Period | 'meeting' | 'title_group'>('monthly');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('total');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [titleFilter, setTitleFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([]);
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [selectedSemesters, setSelectedSemesters] = useState<string[]>([]);
  const [availableSemesters, setAvailableSemesters] = useState<string[]>([]);
  const [periodData, setPeriodData] = useState<PeriodDataPoint[]>([]);
  const [chartData, setChartData] = useState<PeriodDataPoint[]>([]);
  const [breakdownData, setBreakdownData] = useState<PeriodDataPoint[]>([]);
  const [breakdownGranularity, setBreakdownGranularity] = useState<string | null>(null);
  const [chartGranularity, setChartGranularity] = useState<string>('monthly');
  const [summary, setSummary] = useState<EngagementSummary>({
    totalPresentes: 0,
    totalAusentes: 0,
    taxaGeral: 0,
    meetingCount: 0,
    inactiveMemberCount: 0,
    periodAvgRate: 0,
  });
  const [memberStats, setMemberStats] = useState<MemberStat[]>([]);
  const [presenceBreakdown, setPresenceBreakdown] = useState<PresenceBreakdown | null>(null);
  const [meetingList, setMeetingList] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedPeriodData, setSelectedPeriodData] = useState<PeriodDataPoint | null>(null);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setRefreshNonce((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!publicToken) return;
    const url = `/api/engagement?mode=group_info&${apiSuffix}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { groupName: null }))
      .then((d) => setGroupName(d.groupName ?? null));
  }, [publicToken, apiSuffix, refreshNonce]);

  const fetchPeriodData = useCallback(async (
    period: Period, 
    title?: string, 
    yearMonth?: string, 
    quarters?: string[], 
    semesters?: string[]
  ) => {
    setLoading(true);
    try {
      let url = `/api/engagement?period=${period}&member_filter=${memberFilter}`;
      if (apiSuffix) url += `&${apiSuffix}`;
      if (title?.trim()) url += `&title_filter=${encodeURIComponent(title.trim())}`;
      if (period === 'monthly' && yearMonth) url += `&year_month=${encodeURIComponent(yearMonth)}`;
      if (period === 'quarterly' && quarters && quarters.length > 0) {
        url += `&quarters=${quarters.join(',')}`;
      }
      if (period === 'semiannual' && semesters && semesters.length > 0) {
        url += `&semesters=${semesters.join(',')}`;
      }
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setPeriodData(data.periodData ?? []);
      setChartData(data.chartData ?? data.periodData ?? []);
      setBreakdownData(data.breakdownData ?? data.periodData ?? []);
      setBreakdownGranularity(data.breakdownGranularity ?? null);
      setChartGranularity(data.chartGranularity ?? period);
      setSummary(data.summary ?? {
        totalPresentes: 0,
        totalAusentes: 0,
        taxaGeral: 0,
        meetingCount: 0,
        inactiveMemberCount: 0,
        periodAvgRate: 0,
      });
      setMemberStats(data.memberStats ?? []);
      setPresenceBreakdown(data.presenceBreakdown ?? null);
      setMeetingList(data.meetingList ?? []);
      setHasData((data.periodData ?? []).length > 0 || (data.meetingList ?? []).length > 0);
    } finally { setLoading(false); }
  }, [apiSuffix, memberFilter]);

  useEffect(() => {
    if (view === 'monthly') {
      const url = apiSuffix ? `/api/engagement?mode=available_months&${apiSuffix}` : '/api/engagement?mode=available_months';
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { yearMonths: [] }))
        .then((d) => setAvailableMonths(d.yearMonths ?? []));
    } else if (view === 'quarterly') {
      const url = apiSuffix ? `/api/engagement?mode=available_quarters&${apiSuffix}` : '/api/engagement?mode=available_quarters';
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { quarters: [] }))
        .then((d) => setAvailableQuarters(d.quarters ?? []));
    } else if (view === 'semiannual') {
      const url = apiSuffix ? `/api/engagement?mode=available_semesters&${apiSuffix}` : '/api/engagement?mode=available_semesters';
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { semesters: [] }))
        .then((d) => setAvailableSemesters(d.semesters ?? []));
    }
  }, [view, apiSuffix, refreshNonce]);

  const [debouncedTitle, setDebouncedTitle] = useState(titleFilter);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(titleFilter), 400);
    return () => clearTimeout(t);
  }, [titleFilter]);

  useEffect(() => {
    if (view !== 'meeting' && view !== 'title_group') {
      const yearMonth = view === 'monthly' && selectedMonth ? selectedMonth : undefined;
      const quarters = view === 'quarterly' && selectedQuarters.length > 0 ? selectedQuarters : undefined;
      const semesters = view === 'semiannual' && selectedSemesters.length > 0 ? selectedSemesters : undefined;
      fetchPeriodData(view as Period, debouncedTitle, yearMonth, quarters, semesters);
    } else if (view === 'meeting') {
      fetchPeriodData('monthly', debouncedTitle);
    }
  }, [view, selectedMonth, selectedQuarters, selectedSemesters, fetchPeriodData, debouncedTitle, refreshNonce]);

  const periodLabel = PERIOD_OPTIONS.find((o) => o.value === view)?.label ?? '';
  const chartGranularityLabel = CHART_GRANULARITY_LABELS[chartGranularity] ?? chartGranularity;
  const breakdownRows = breakdownGranularity ? breakdownData : periodData;
  const filteredMemberStats =
    presenceFilter === 'absent'
      ? memberStats.filter((m) => m.absences > 0)
      : presenceFilter === 'present'
        ? memberStats.filter((m) => m.presences > 0)
        : memberStats;
  const perfectAttendance = filteredMemberStats.filter((m) => m.presences > 0 && m.absences === 0).map((m) => m.name);

  // Recorte explícito escolhido (mês, trimestres ou semestres): os cards de
  // Total de Presenças/Ausências e a linha consolidada do resumo só aparecem
  // com período delimitado — sem filtro, o total acumulado confunde.
  const hasExplicitCut =
    (view === 'monthly' && !!selectedMonth) ||
    (view === 'quarterly' && selectedQuarters.length > 0) ||
    (view === 'semiannual' && selectedSemesters.length > 0);

  const handlePeriodClick = (periodData: PeriodDataPoint) => {
    setSelectedPeriodData(periodData);
    setPeriodDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            {groupName && (
              <p className="text-sm font-medium text-muted-foreground mb-1">Grupo: {groupName}</p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold">Engajamento</h1>
            <p className="text-muted-foreground mt-1 text-sm">Análise de presença por período ou encontro</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!publicToken && (
              <Button variant="outline" size="sm" className="gap-2 print:hidden" asChild>
                <Link href="/engajamento/analises">
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Análises avançadas</span>
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-2 print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Exportar PDF</span>
            </Button>
          </div>
        </div>
        <PeriodSelector
          selected={view}
          onChange={setView}
          titleFilter={titleFilter}
          onTitleFilterChange={setTitleFilter}
          monthFilter={selectedMonth}
          onMonthFilterChange={setSelectedMonth}
          availableMonths={availableMonths.length > 0 ? availableMonths : undefined}
          quarterFilter={selectedQuarters}
          onQuarterFilterChange={setSelectedQuarters}
          availableQuarters={availableQuarters.length > 0 ? availableQuarters : undefined}
          semesterFilter={selectedSemesters}
          onSemesterFilterChange={setSelectedSemesters}
          availableSemesters={availableSemesters.length > 0 ? availableSemesters : undefined}
        />
        <MemberFilterSelector value={memberFilter} onChange={setMemberFilter} />
        <PresenceFilterSelector value={presenceFilter} onChange={setPresenceFilter} />
      </div>

      {presenceFilter !== 'all' && (
        <div className={`rounded-lg border p-3 ${
          presenceFilter === 'absent' 
            ? 'border-red-200 bg-red-50 dark:bg-red-950/20' 
            : 'border-green-200 bg-green-50 dark:bg-green-950/20'
        }`}>
          <div className="flex items-center gap-2">
            {presenceFilter === 'absent' ? (
              <XCircle className="h-5 w-5 text-red-600 shrink-0" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            )}
            <div>
              <p className={`text-sm font-semibold ${
                presenceFilter === 'absent' 
                  ? 'text-red-900 dark:text-red-100' 
                  : 'text-green-900 dark:text-green-100'
              }`}>
                {presenceFilter === 'absent' 
                  ? 'Visualizando apenas membros com faltas' 
                  : 'Visualizando apenas membros presentes'}
              </p>
              <p className={`text-xs ${
                presenceFilter === 'absent' 
                  ? 'text-red-800 dark:text-red-200' 
                  : 'text-green-800 dark:text-green-200'
              }`}>
                {presenceFilter === 'absent'
                  ? 'Os gráficos mostram dados filtrados. Membros com 100% de presença estão ocultos.'
                  : 'Os gráficos mostram dados filtrados. Membros com apenas faltas estão ocultos.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {!publicToken && !groupId && <EngagementShareToggle />}

      <DataInterpretationGuide />

      <EngagementGrowth
        apiSuffix={apiSuffix}
        period={view}
        monthFilter={selectedMonth}
        quarterFilter={selectedQuarters}
        semesterFilter={selectedSemesters}
      />

      {view === 'title_group' ? (
        <TitleGroupView apiSuffix={apiSuffix} memberFilter={memberFilter} presenceFilter={presenceFilter} refreshKey={refreshNonce} />
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData && view !== 'meeting' ? (
        <div className="text-center py-16 border rounded-lg">
          <p className="text-lg text-muted-foreground">Sem dados de presença no período.</p>
          <p className="text-sm text-muted-foreground mt-1">Registre presenças na página de Chamada para ver as análises aqui.</p>
        </div>
      ) : view === 'meeting' ? (
        <MeetingDetailView meetings={meetingList} memberFilter={memberFilter} presenceFilter={presenceFilter} apiSuffix={apiSuffix} />
      ) : (
        <>
          <StatsCards
            summary={summary}
            periodData={periodData}
            perfectAttendance={perfectAttendance}
            memberStats={filteredMemberStats}
            presenceFilter={presenceFilter}
            presenceBreakdown={presenceBreakdown}
            showTotals={hasExplicitCut}
          />

          <PeriodSummaryBreakdown
            summary={summary}
            breakdownRows={breakdownRows}
            periodLabel={periodLabel}
            breakdownGranularity={breakdownGranularity}
            chartGranularity={chartGranularity}
            showTotals={hasExplicitCut}
          />
          <EngagementPeriodCharts
            data={chartData}
            periodLabel={periodLabel}
            chartGranularityLabel={chartGranularityLabel}
            onPeriodClick={handlePeriodClick}
            presenceFilter={presenceFilter}
          />
          <PeriodDetailDialog
            open={periodDialogOpen}
            onOpenChange={setPeriodDialogOpen}
            periodData={selectedPeriodData}
            apiSuffix={apiSuffix}
            memberFilter={memberFilter}
            period={(chartGranularity as Period) ?? (view as Period)}
          />
        </>
      )}
    </div>
  );
}
