'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserPlus, TrendingDown } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';

interface VisitorFunnelStage {
  stage: 'visit_1' | 'visit_2' | 'visit_3' | 'visit_4' | 'converted';
  label: string;
  count: number;
  percentage: number;
  dropoff: number;
  memberIds: string[];
  benchmark: number;
}

interface VisitorFunnel {
  stages: VisitorFunnelStage[];
  total_visitors: number;
  conversion_rate: number;
  avg_visits_to_conversion: number;
  period_days: number;
}

interface VisitorFunnelCardProps {
  periodDays?: number;
}

export function VisitorFunnelCard({ periodDays = 180 }: VisitorFunnelCardProps) {
  const [data, setData] = useState<VisitorFunnel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const url = `/api/engagement/visitor-funnel?period=${periodDays}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error('Erro ao buscar funil de visitantes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [periodDays]);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5" />
            Funil de Visitantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  if (data.total_visitors === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-5 w-5" />
            Funil de Visitantes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sem visitantes no período de {periodDays} dias.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-5 w-5 text-blue-600" />
                Funil de Visitantes
              </CardTitle>
              <InfoTooltip
                content={
                  <div>
                    <p className="font-semibold mb-1">Jornada do Visitante</p>
                    <p className="mb-2">
                      Acompanhe a progressão dos visitantes desde a primeira visita até a conversão em membro.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <strong>Benchmarks de mercado:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                      <li>40% devem retornar para 2ª visita</li>
                      <li>60% dos que voltam devem ir para 3ª</li>
                      <li>70% dos que chegam na 3ª devem ir para 4ª</li>
                      <li>20% do total inicial deve converter</li>
                    </ul>
                  </div>
                }
                side="right"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total_visitors} visitantes nos últimos {periodDays} dias
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg border bg-muted/30">
            <p className="text-2xl font-bold text-green-600">{data.conversion_rate}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
            <p className="text-xs text-muted-foreground mt-1">
              (meta: ≥20%)
            </p>
          </div>
          <div className="text-center p-3 rounded-lg border bg-muted/30">
            <p className="text-2xl font-bold text-blue-600">{data.avg_visits_to_conversion}</p>
            <p className="text-xs text-muted-foreground">Visitas até Conversão</p>
            <p className="text-xs text-muted-foreground mt-1">
              (média)
            </p>
          </div>
        </div>

        <div className="space-y-1">
          {data.stages.map((stage, index) => {
            const isLastStage = index === data.stages.length - 1;
            const percentageDiff = stage.percentage - stage.benchmark;
            const isAboveBenchmark = percentageDiff >= 0;
            const isSignificantDiff = Math.abs(percentageDiff) >= 5;

            // Calcular a largura da barra (proporcional ao maior valor)
            const maxCount = data.stages[0].count;
            const barWidth = (stage.count / maxCount) * 100;

            return (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <p className="text-sm font-medium w-24">{stage.label}</p>
                    <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden">
                      <div
                        className={`h-full ${
                          stage.stage === 'converted'
                            ? 'bg-green-500'
                            : stage.stage === 'visit_1'
                              ? 'bg-blue-500'
                              : stage.stage === 'visit_2'
                                ? 'bg-blue-400'
                                : stage.stage === 'visit_3'
                                  ? 'bg-blue-300'
                                  : 'bg-blue-200'
                        } flex items-center justify-center text-white text-xs font-medium`}
                        style={{ width: `${barWidth}%` }}
                      >
                        {barWidth > 15 && `${stage.count}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">{stage.count}</p>
                    <p className="text-xs text-muted-foreground">{stage.percentage}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pl-24">
                  {!isLastStage && stage.dropoff > 0 && (
                    <div className="flex items-center gap-1 text-xs text-red-600">
                      <TrendingDown className="h-3 w-3" />
                      <span>-{stage.dropoff}% abandonaram</span>
                    </div>
                  )}
                  {isSignificantDiff && (
                    <Badge
                      variant={isAboveBenchmark ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {isAboveBenchmark ? (
                        <>✓ {percentageDiff}pp acima</>
                      ) : (
                        <>⚠ {Math.abs(percentageDiff)}pp abaixo</>
                      )}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
          <p className="font-medium">Análise Rápida:</p>
          <ul className="space-y-1 list-disc list-inside">
            {data.stages[1].percentage < data.stages[1].benchmark && (
              <li className="text-red-600">
                Taxa de retorno para 2ª visita ({data.stages[1].percentage}%) abaixo do ideal ({data.stages[1].benchmark}%).
                Revise o follow-up de primeiras visitas.
              </li>
            )}
            {data.conversion_rate < 20 && (
              <li className="text-amber-600">
                Taxa de conversão ({data.conversion_rate}%) abaixo da meta (20%).
                Reforce o processo de integração.
              </li>
            )}
            {data.conversion_rate >= 20 && (
              <li className="text-green-600">
                Ótima taxa de conversão! Continue com as práticas atuais.
              </li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
