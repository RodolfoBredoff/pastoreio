'use client';

import { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { BarChart3, Trophy, Users, TrendingUp } from 'lucide-react';
import type { GroupComparisonRow } from '@/app/api/coordinator/groups/comparison/route';

const COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6',
];

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function GroupsComparisonChart() {
  const [groups, setGroups] = useState<GroupComparisonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/coordinator/groups/comparison')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setGroups(data))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground text-sm">Carregando comparativo...</p>
        </CardContent>
      </Card>
    );
  }

  if (groups.length === 0) {
    return null;
  }

  const chartData = groups.map((g, i) => ({
    name: g.name.length > 16 ? g.name.substring(0, 14) + '…' : g.name,
    fullName: g.name,
    'Taxa de Presença (%)': g.avg_attendance_rate,
    Membros: g.member_count,
    Visitantes: g.visitor_count,
    color: COLORS[i % COLORS.length],
  }));

  const best = groups[0];
  const totalMembers = groups.reduce((s, g) => s + g.member_count, 0);
  const totalVisitors = groups.reduce((s, g) => s + g.visitor_count, 0);
  const avgRate =
    groups.length > 0
      ? (groups.reduce((s, g) => s + g.avg_attendance_rate, 0) / groups.length).toFixed(1)
      : '0';

  return (
    <div className="space-y-4">
      {/* Resumo executivo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total de Membros</p>
            </div>
            <p className="text-2xl font-bold">{totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Visitantes</p>
            </div>
            <p className="text-2xl font-bold">{totalVisitors}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Presença Média</p>
            </div>
            <p className="text-2xl font-bold">{avgRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-yellow-600" />
              <p className="text-xs text-yellow-700">Melhor Presença</p>
            </div>
            <p className="text-sm font-bold text-yellow-800 truncate">{best.name}</p>
            <p className="text-xl font-bold text-yellow-700">{best.avg_attendance_rate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de barras */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Taxa de Presença por Grupo (últimos 90 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) => [`${value}%`, name]}
                labelFormatter={(label: string, payload) => {
                  const p = payload?.[0]?.payload;
                  return p?.fullName ?? label;
                }}
              />
              <Bar dataKey="Taxa de Presença (%)" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela detalhada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking Detalhado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">#</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground">Grupo</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Membros</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Visitantes</th>
                  <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">Encontros</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Presença</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group, i) => (
                  <tr key={group.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium">{group.name}</td>
                    <td className="py-2 pr-4 text-right">{group.member_count}</td>
                    <td className="py-2 pr-4 text-right">{group.visitor_count}</td>
                    <td className="py-2 pr-4 text-right">{group.total_meetings}</td>
                    <td className="py-2 text-right">
                      <Badge
                        className={
                          group.avg_attendance_rate >= 75
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : group.avg_attendance_rate >= 50
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-red-100 text-red-800 border-red-200'
                        }
                      >
                        {group.avg_attendance_rate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
