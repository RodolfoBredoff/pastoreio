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
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, Users, UserCheck, X } from 'lucide-react';
import { INTEGRATION_STAGE_LABELS, VISITOR_STATUS_LABELS } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LinkButton } from '@/components/ui/link-button';

interface StageStats {
  stage: string;
  count: number;
  marked_not_returned_count: number;
}

interface FunnelMetrics {
  novo_visitante: number;
  retornou: number;
  integrando: number;
  membro: number;
  nao_retornou: number;
  taxa_retorno: number;
  taxa_integracao: number;
  taxa_conversao_membro: number;
}

interface StatsResponse {
  stageStats: StageStats[];
  funnel: FunnelMetrics;
  totalVisitors: number;
  period: string;
}

type Period = 'all' | '30' | '60' | '90';

const STAGE_COLORS: Record<string, string> = {
  novo_visitante: 'hsl(210, 16%, 60%)',
  retornou: 'hsl(217, 91%, 60%)',
  integrando: 'hsl(38, 92%, 50%)',
  membro: 'hsl(142, 71%, 45%)',
  nao_retornou: 'hsl(0, 84%, 60%)',
};

interface MemberByStage {
  id: string;
  full_name: string;
  phone: string;
  integration_stage: string;
  marked_not_returned: boolean;
}

export function IntegrationStagesPanel() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [stageMembers, setStageMembers] = useState<MemberByStage[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadStats = useCallback(async (selectedPeriod: Period) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/integration-stages/stats?period=${selectedPeriod}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats(period);
  }, [period, loadStats]);

  const loadMembersByStage = useCallback(async (stage: string) => {
    setLoadingMembers(true);
    setSelectedStage(stage);
    setDialogOpen(true);
    try {
      const res = await fetch(
        `/api/integration-stages/members?stage=${stage}&period=${period}`,
        { cache: 'no-store' }
      );
      if (res.ok) {
        const data = await res.json();
        setStageMembers(data.members || []);
      }
    } catch (error) {
      console.error('Erro ao buscar membros:', error);
    } finally {
      setLoadingMembers(false);
    }
  }, [period]);

  const handleBarClick = (data: { stage: string }) => {
    if (data && data.stage) {
      void loadMembersByStage(data.stage);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando estatísticas...
      </div>
    );
  }

  if (!stats || stats.stageStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground text-center">
            Nenhum visitante cadastrado ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Preparar dados do funil (barras horizontais)
  const funnelData = [
    {
      name: INTEGRATION_STAGE_LABELS.novo_visitante,
      value: stats.funnel.novo_visitante,
      stage: 'novo_visitante',
    },
    {
      name: INTEGRATION_STAGE_LABELS.retornou,
      value: stats.funnel.retornou,
      stage: 'retornou',
    },
    {
      name: INTEGRATION_STAGE_LABELS.integrando,
      value: stats.funnel.integrando,
      stage: 'integrando',
    },
    {
      name: INTEGRATION_STAGE_LABELS.membro,
      value: stats.funnel.membro,
      stage: 'membro',
    },
  ];

  // Preparar dados do gráfico de barras vertical (incluindo não retornou)
  const distributionData = [
    ...stats.stageStats.map((s) => ({
      name: INTEGRATION_STAGE_LABELS[s.stage] || s.stage,
      value: s.count,
      stage: s.stage,
    })),
    ...(stats.funnel.nao_retornou > 0
      ? [
          {
            name: VISITOR_STATUS_LABELS.not_returned,
            value: stats.funnel.nao_retornou,
            stage: 'nao_retornou',
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">Período:</span>
        <Button
          variant={period === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('all')}
        >
          Todos
        </Button>
        <Button
          variant={period === '30' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('30')}
        >
          Últimos 30 dias
        </Button>
        <Button
          variant={period === '60' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('60')}
        >
          Últimos 60 dias
        </Button>
        <Button
          variant={period === '90' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPeriod('90')}
        >
          Últimos 90 dias
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadStats(period)}
          className="ml-auto"
        >
          <Loader2 className="h-3.5 w-3.5 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total de Visitantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalVisitors}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Taxa de Retorno
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {stats.funnel.taxa_retorno.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.funnel.retornou} de {stats.funnel.novo_visitante} voltaram
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Taxa de Integração
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {stats.funnel.taxa_integracao.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.funnel.integrando} em processo de integração
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Taxa de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {stats.funnel.taxa_conversao_membro.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.funnel.membro} membros integrados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Funil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Funil de Integração</CardTitle>
          <p className="text-sm text-muted-foreground">
            Visualização do fluxo de visitantes pelos estágios de integração
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip 
                formatter={(value: number) => [`${value} pessoa${value !== 1 ? 's' : ''}`, '']}
              />
              <Bar 
                dataKey="value" 
                name="Pessoas" 
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(data) => handleBarClick(data)}
              >
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] || '#888'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Distribuição */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Distribuição por Estágio</CardTitle>
          <p className="text-sm text-muted-foreground">
            Quantidade de pessoas em cada estágio
            {stats.funnel.nao_retornou > 0 && ' (incluindo visitantes que não retornaram)'}
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distributionData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }} 
                interval={0}
                angle={-15}
                textAnchor="end"
                height={70}
              />
              <YAxis allowDecimals={false} />
              <Tooltip 
                formatter={(value: number) => [`${value} pessoa${value !== 1 ? 's' : ''}`, '']}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar 
                dataKey="value" 
                name="Pessoas" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data) => handleBarClick(data)}
              >
                {distributionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={STAGE_COLORS[entry.stage] || '#888'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Informações adicionais */}
      {stats.funnel.nao_retornou > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <Users className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <h4 className="font-semibold text-red-900">
                  {stats.funnel.nao_retornou} visitante{stats.funnel.nao_retornou !== 1 ? 's' : ''} marcado{stats.funnel.nao_retornou !== 1 ? 's' : ''} como "Não Retornou"
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  Esses visitantes tiveram 3 ou mais encontros consecutivos sem presença e foram 
                  marcados automaticamente ou manualmente como não retornaram.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog com lista de membros */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                {selectedStage === 'nao_retornou'
                  ? VISITOR_STATUS_LABELS.not_returned
                  : selectedStage
                  ? INTEGRATION_STAGE_LABELS[selectedStage]
                  : 'Membros'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Carregando...</span>
            </div>
          ) : stageMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma pessoa neste estágio
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">
                {stageMembers.length} pessoa{stageMembers.length !== 1 ? 's' : ''} encontrada{stageMembers.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {stageMembers.map((member) => (
                  <Card key={member.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{member.full_name}</p>
                        <p className="text-sm text-muted-foreground">{member.phone}</p>
                        {member.marked_not_returned && (
                          <span className="inline-block mt-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            Não Retornou
                          </span>
                        )}
                      </div>
                      <LinkButton
                        href={`/pessoas/${member.id}`}
                        variant="outline"
                        size="sm"
                      >
                        Ver detalhes
                      </LinkButton>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
