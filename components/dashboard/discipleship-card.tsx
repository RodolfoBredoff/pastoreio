'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, UserPlus } from 'lucide-react';
import { DiscipleshipBarChart } from '@/components/dashboard/engagement-charts';

interface DiscipleshipStats {
  totalMembers: number;
  totalLinked: number;
  totalUnlinked: number;
  byDiscipulador: {
    discipuladorId: string;
    discipuladorName: string;
    count: number;
    members: { id: string; full_name: string }[];
  }[];
}

/**
 * "Pessoas vinculadas a um discipulador": gráfico + lista de vínculos, com
 * filtro por discipulador. Vive na página de Análises avançadas (movido da
 * página principal de engajamento para condensá-la).
 */
export function DiscipleshipCard({ apiSuffix }: { apiSuffix: string }) {
  const [stats, setStats] = useState<DiscipleshipStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterDiscipuladorId, setFilterDiscipuladorId] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    const url = apiSuffix ? `/api/discipleship?${apiSuffix}` : '/api/discipleship';
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .finally(() => setLoading(false));
  }, [apiSuffix]);

  if (loading || !stats) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const list = filterDiscipuladorId
    ? stats.byDiscipulador.filter((d) => d.discipuladorId === filterDiscipuladorId)
    : stats.byDiscipulador;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-5 w-5" />
          Pessoas vinculadas a um discipulador
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {stats.totalLinked} de {stats.totalMembers} pessoas com discipulador definido
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Filtrar por discipulador:</span>
          <select
            value={filterDiscipuladorId}
            onChange={(e) => setFilterDiscipuladorId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm min-w-[180px]"
          >
            <option value="">Todos</option>
            {stats.byDiscipulador.map((d) => (
              <option key={d.discipuladorId} value={d.discipuladorId}>
                {d.discipuladorName} ({d.count})
              </option>
            ))}
          </select>
        </div>
        {list.length > 0 ? (
          <>
            <DiscipleshipBarChart
              labels={list.map((d) => d.discipuladorName)}
              values={list.map((d) => d.count)}
            />
            <div className="text-sm text-muted-foreground">
              {list.map((d) => (
                <div key={d.discipuladorId} className="flex justify-between py-0.5">
                  <span>{d.discipuladorName}</span>
                  <span className="font-medium">{d.count} pessoa{d.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            {/* Lista de pessoas vinculadas a cada discipulador */}
            <div className="border-t pt-4 space-y-4">
              <h4 className="text-sm font-medium text-foreground">Pessoas vinculadas a cada discipulador</h4>
              {list.map((d) => {
                const members = d.members ?? [];
                if (members.length === 0) return null;
                return (
                  <div key={d.discipuladorId} className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
                    <p className="text-sm font-medium">
                      {d.discipuladorName} — {members.length} pessoa{members.length !== 1 ? 's' : ''}
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                      {members.map((m) => (
                        <li key={m.id}>{m.full_name}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum vínculo com discipulador cadastrado.</p>
        )}
      </CardContent>
    </Card>
  );
}
