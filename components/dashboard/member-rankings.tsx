'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Award } from 'lucide-react';

export interface RankingMemberStat {
  id?: string;
  name: string;
  type: string;
  presences: number;
  absences: number;
  taxa: number;
}

/**
 * Rankings de presença: Top 5 mais presentes, Top 5 mais ausentes e
 * membros destaque (100% de presença). Vivem na página de Análises avançadas.
 */
export function MemberRankings({ topPresent, topAbsent, perfectAttendance }: {
  topPresent: RankingMemberStat[]; topAbsent: RankingMemberStat[]; perfectAttendance: string[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-green-600" />Top 5 Mais Presentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topPresent.length > 0 ? topPresent.map((m, i) => (
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
              )) : <p className="text-sm text-muted-foreground">Sem dados suficientes</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-5 w-5 text-red-600" />Top 5 Mais Ausentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topAbsent.length > 0 ? topAbsent.map((m, i) => (
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
              )) : <p className="text-sm text-muted-foreground">Sem dados suficientes</p>}
            </div>
          </CardContent>
        </Card>
      </div>
      {perfectAttendance.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Award className="h-5 w-5" />Membros Destaque (100% de Presença)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {perfectAttendance.map((name, i) => (
                <Badge key={i} variant="secondary" className="bg-yellow-200 text-yellow-800">{name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
