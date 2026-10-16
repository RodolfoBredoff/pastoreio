'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AtRiskMembersCard } from '@/components/dashboard/at-risk-members-card';
import { FrequencyDistributionCard } from '@/components/dashboard/frequency-distribution-card';
import { VisitorFunnelCard } from '@/components/dashboard/visitor-funnel-card';
import { RetentionMetricsCard } from '@/components/dashboard/retention-metrics-card';
import { MemberRankings, type RankingMemberStat } from '@/components/dashboard/member-rankings';
import {
  PERIOD_OPTIONS,
  MemberFilterSelector,
  PresenceFilterSelector,
  type Period,
  type MemberFilter,
  type PresenceFilter,
} from '@/components/dashboard/engagement-filter-controls';

/**
 * Análises avançadas de engajamento (funil, retenção, frequência, risco e rankings).
 * Ficam em uma página separada para manter a página principal de engajamento
 * simples e focada em crescimento.
 */
export function EngagementAnalisesClient({ apiSuffix = '' }: { apiSuffix?: string }) {
  const [period, setPeriod] = useState<Period>('monthly');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('total');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [memberStats, setMemberStats] = useState<RankingMemberStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/engagement?period=${period}&member_filter=${memberFilter}`;
      if (apiSuffix) url += `&${apiSuffix}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMemberStats(data.memberStats ?? []);
      setHasData((data.periodData ?? []).length > 0);
    } finally {
      setLoading(false);
    }
  }, [period, memberFilter, apiSuffix]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filteredStats = memberStats.filter((m) =>
    presenceFilter === 'all' ? true : presenceFilter === 'absent' ? m.absences > 0 : m.presences > 0
  );
  const topPresent = [...filteredStats]
    .filter((m) => m.presences + m.absences > 0)
    .sort((a, b) => b.presences - a.presences)
    .slice(0, 5);
  const topAbsent = [...filteredStats]
    .filter((m) => m.absences > 0)
    .sort((a, b) => b.absences - a.absences)
    .slice(0, 5);
  const perfectAttendance = filteredStats
    .filter((m) => m.presences > 0 && m.absences === 0)
    .map((m) => m.name);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
          <Link href="/engajamento" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Engajamento
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Análises avançadas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Funil de visitantes, retenção, frequência, risco e rankings — para quem quer profundidade.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={period === opt.value ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            title={opt.desc}
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
        <MemberFilterSelector value={memberFilter} onChange={setMemberFilter} />
        <PresenceFilterSelector value={presenceFilter} onChange={setPresenceFilter} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !hasData ? (
        <div className="text-center py-16 border rounded-lg">
          <p className="text-lg text-muted-foreground">Sem dados de presença no período.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <AtRiskMembersCard memberFilter={memberFilter} periodDays={90} />
            <FrequencyDistributionCard memberFilter={memberFilter} periodDays={90} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <VisitorFunnelCard periodDays={180} />
            <RetentionMetricsCard memberFilter={memberFilter} />
          </div>
          <MemberRankings topPresent={topPresent} topAbsent={topAbsent} perfectAttendance={perfectAttendance} />
        </>
      )}
    </div>
  );
}
