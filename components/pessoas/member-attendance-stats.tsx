'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, TrendingUp, Loader2 } from 'lucide-react';

interface ByTitleRow {
  title: string;
  meetingCount: number;
  presentCount: number;
  rate: number;
}

interface AttendanceStats {
  totalMeetings: number;
  totalPresent: number;
  byTitle: ByTitleRow[];
}

interface MemberAttendanceStatsProps {
  memberId: string;
  /** Quando true, não renderiza o Card externo (para uso dentro de dialog) */
  embedded?: boolean;
  /** Opcional: group_id para contexto de engajamento por grupo (coordenador/admin) */
  groupId?: string | null;
}

export function MemberAttendanceStats({ memberId, embedded = false, groupId }: MemberAttendanceStatsProps) {
  const [data, setData] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = groupId
      ? `/api/members/${memberId}/attendance?group_id=${encodeURIComponent(groupId)}`
      : `/api/members/${memberId}/attendance`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [memberId, groupId]);

  if (loading) {
    return (
      <div className={embedded ? 'py-6 flex items-center justify-center' : ''}>
        {embedded ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : (
          <Card>
            <CardContent className="py-8 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const totalRate = data.totalMeetings > 0
    ? Math.round((data.totalPresent / data.totalMeetings) * 100)
    : 0;

  const content = (
    <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{data.totalMeetings}</p>
            <p className="text-xs text-muted-foreground">Encontros com registro</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{data.totalPresent}</p>
            <p className="text-xs text-muted-foreground">Vezes presente</p>
          </div>
        </div>
        {data.totalMeetings > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${totalRate}%` }}
              />
            </div>
            <span className="text-sm font-medium shrink-0">{totalRate}% taxa geral</span>
          </div>
        )}

        {data.byTitle.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              Frequência por tipo de encontro
            </p>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {data.byTitle.map((row) => (
                <li
                  key={row.title}
                  className="flex items-center justify-between py-2 px-3 rounded-md border bg-muted/30 text-sm"
                >
                  <span className="font-medium truncate flex-1 min-w-0 mr-2">{row.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground text-xs">
                      {row.presentCount}/{row.meetingCount}
                    </span>
                    <Badge variant={row.rate >= 70 ? 'default' : row.rate >= 50 ? 'secondary' : 'outline'} className="text-xs">
                      {row.rate}%
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.totalMeetings === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum registro de presença ainda.
          </p>
        )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4" />
          Presença em Encontros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
}
