'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingDown, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import type { MemberFilter } from '@/components/dashboard/engagement-filter-controls';

interface MemberAtRisk {
  id: string;
  full_name: string;
  member_type: 'participant' | 'visitor';
  phone: string | null;
  consecutive_absences: number;
  frequency_rate: number;
  total_meetings: number;
  attended: number;
  last_attendance_date: string | null;
  days_since_last: number | null;
  risk_level: 'medium' | 'high' | 'critical';
  risk_factors: string[];
}

interface AtRiskData {
  members: MemberAtRisk[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
  };
  benchmark: {
    threshold: number;
    period_days: number;
  };
}

interface AtRiskMembersCardProps {
  memberFilter: MemberFilter;
  periodDays?: number;
}

export function AtRiskMembersCard({ memberFilter, periodDays = 90 }: AtRiskMembersCardProps) {
  const [data, setData] = useState<AtRiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<'all' | 'critical' | 'high' | 'medium'>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `/api/members/at-risk?period=${periodDays}&member_filter=${memberFilter}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error('Erro ao buscar membros em risco:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [memberFilter, periodDays]);

  if (loading || !data) {
    return (
      <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Membros em Risco
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  const totalMembers = data.summary.total;
  const benchmark = data.benchmark.threshold * 100; // 15%
  const isHealthy = totalMembers === 0; // 0 membros em risco é ideal
  const exceedsBenchmark = totalMembers > 0; // Qualquer membro em risco requer atenção

  const filteredMembers =
    selectedRiskLevel === 'all'
      ? data.members
      : data.members.filter((m) => m.risk_level === selectedRiskLevel);

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-600 text-white';
      case 'medium':
        return 'bg-amber-600 text-white';
      default:
        return 'bg-gray-600 text-white';
    }
  };

  const getRiskLevelLabel = (level: string) => {
    switch (level) {
      case 'critical':
        return 'Crítico';
      case 'high':
        return 'Alto';
      case 'medium':
        return 'Médio';
      default:
        return level;
    }
  };

  return (
    <Card className={`${isHealthy ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'} dark:border-amber-800 dark:bg-amber-950/20`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className={`h-5 w-5 ${isHealthy ? 'text-green-600' : 'text-amber-600'}`} />
                Membros em Risco
              </CardTitle>
              <InfoTooltip
                content={
                  <div>
                    <p className="font-semibold mb-1">Como identificamos?</p>
                    <p className="mb-2">
                      Membros são considerados em risco quando apresentam:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>2+ ausências consecutivas</li>
                      <li>Frequência de presença {'<'} 60%</li>
                      <li>Mais de 30 dias sem presença</li>
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Benchmark: {'<'}{benchmark}% do grupo (ideal: 0%)
                    </p>
                  </div>
                }
                side="right"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isHealthy ? 'Nenhum membro em risco no momento' : `${totalMembers} ${totalMembers === 1 ? 'pessoa precisa' : 'pessoas precisam'} de atenção`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-lg border bg-red-50 dark:bg-red-950/20">
            <p className="text-2xl font-bold text-red-700">{data.summary.critical}</p>
            <p className="text-xs text-red-600">Crítico</p>
          </div>
          <div className="text-center p-3 rounded-lg border bg-orange-50 dark:bg-orange-950/20">
            <p className="text-2xl font-bold text-orange-700">{data.summary.high}</p>
            <p className="text-xs text-orange-600">Alto</p>
          </div>
          <div className="text-center p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20">
            <p className="text-2xl font-bold text-amber-700">{data.summary.medium}</p>
            <p className="text-xs text-amber-600">Médio</p>
          </div>
        </div>

        {totalMembers > 0 && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filtrar por nível:</span>
              <Button
                size="sm"
                variant={selectedRiskLevel === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedRiskLevel('all')}
              >
                Todos ({totalMembers})
              </Button>
              <Button
                size="sm"
                variant={selectedRiskLevel === 'critical' ? 'destructive' : 'outline'}
                onClick={() => setSelectedRiskLevel('critical')}
              >
                Crítico ({data.summary.critical})
              </Button>
              <Button
                size="sm"
                variant={selectedRiskLevel === 'high' ? 'default' : 'outline'}
                onClick={() => setSelectedRiskLevel('high')}
                className={selectedRiskLevel === 'high' ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                Alto ({data.summary.high})
              </Button>
              <Button
                size="sm"
                variant={selectedRiskLevel === 'medium' ? 'default' : 'outline'}
                onClick={() => setSelectedRiskLevel('medium')}
                className={selectedRiskLevel === 'medium' ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                Médio ({data.summary.medium})
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full gap-2"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? 'Ocultar detalhes' : `Ver lista de ${filteredMembers.length} ${filteredMembers.length === 1 ? 'pessoa' : 'pessoas'}`}
            </Button>

            {expanded && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredMembers.map((member) => (
                  <div
                    key={member.id}
                    className="p-3 rounded-lg border bg-white dark:bg-card space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{member.full_name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {member.member_type === 'participant' ? 'Membro' : 'Visitante'}
                          </Badge>
                          <Badge className={`text-xs ${getRiskLevelColor(member.risk_level)}`}>
                            {getRiskLevelLabel(member.risk_level)}
                          </Badge>
                        </div>
                        {member.phone && (
                          <a
                            href={`https://wa.me/${member.phone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 mt-1"
                          >
                            <Phone className="h-3 w-3" />
                            {member.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Frequência:</span>
                        <span className="font-medium">{member.frequency_rate}% ({member.attended}/{member.total_meetings})</span>
                      </div>
                      {member.days_since_last !== null && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Última presença:</span>
                          <span className="font-medium">{member.days_since_last} dias atrás</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {member.risk_factors.map((factor, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {totalMembers === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-green-700 font-medium">
              Parabéns! Nenhum membro em risco detectado.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os membros ativos estão engajados.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
