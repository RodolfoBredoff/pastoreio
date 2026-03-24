'use client';

import { useEffect, useMemo, useState } from 'react';
import { PessoaCard } from '@/components/pessoas/pessoa-card';
import { BroadcastDialogClient } from '@/components/pessoas/broadcast-dialog-client';
import { LinkButton } from '@/components/ui/link-button';
import { Button } from '@/components/ui/button';
import { UserPlus, Users } from 'lucide-react';
import type { Member } from '@/lib/db/queries';

type ListMode = 'all' | 'absent' | 'present';
type MemberTypeFilter = 'total' | 'participants' | 'visitors';
type AbsentMetricMode = 'most_absent' | 'consecutive' | 'month';
type AbsentScope = 'all' | 'last10';

interface AbsentRow {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  consecutive_absences?: number;
}

interface PessoasListClientProps {
  members: Member[];
  canDelete: boolean;
}

function filterByMemberType(members: Member[], memberTypeFilter: MemberTypeFilter): Member[] {
  if (memberTypeFilter === 'participants') return members.filter((m) => m.member_type === 'participant');
  if (memberTypeFilter === 'visitors') return members.filter((m) => m.member_type === 'visitor');
  return members;
}

export function PessoasListClient({ members, canDelete }: PessoasListClientProps) {
  const [listMode, setListMode] = useState<ListMode>('all');
  const [memberTypeFilter, setMemberTypeFilter] = useState<MemberTypeFilter>('total');
  const [absentMetricMode, setAbsentMetricMode] = useState<AbsentMetricMode>('most_absent');
  const [absentYearMonth, setAbsentYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [absentScope, setAbsentScope] = useState<AbsentScope>('all');
  const [absentRows, setAbsentRows] = useState<AbsentRow[]>([]);
  const [presentRows, setPresentRows] = useState<AbsentRow[]>([]);
  const [loading, setLoading] = useState(false);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  useEffect(() => {
    if (listMode !== 'absent') return;
    setLoading(true);
    const params = new URLSearchParams({
      presence: 'absent',
      member_filter: memberTypeFilter,
      limit: '200',
    });
    if (absentMetricMode === 'most_absent') {
      params.set('mode', 'most_absent');
      params.set('scope', absentScope === 'all' ? 'all' : 'last10');
    } else if (absentMetricMode === 'month') {
      params.set('mode', 'month');
      params.set('year_month', absentYearMonth);
    } else {
      params.set('mode', 'consecutive');
      params.set('scope', absentScope === 'all' ? 'all' : 'last10');
    }
    fetch(`/api/members/absent?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AbsentRow[]) => setAbsentRows(data))
      .catch(() => setAbsentRows([]))
      .finally(() => setLoading(false));
  }, [listMode, memberTypeFilter, absentMetricMode, absentYearMonth, absentScope]);

  useEffect(() => {
    if (listMode !== 'present') return;
    setLoading(true);
    const params = new URLSearchParams({
      presence: 'present',
      member_filter: memberTypeFilter,
    });
    fetch(`/api/members/absent?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AbsentRow[]) => setPresentRows(data))
      .catch(() => setPresentRows([]))
      .finally(() => setLoading(false));
  }, [listMode, memberTypeFilter]);

  const displayedMembers = useMemo(() => {
    if (listMode === 'all') {
      return filterByMemberType(members, memberTypeFilter).sort((a, b) =>
        a.full_name.localeCompare(b.full_name, 'pt-BR')
      );
    }
    if (listMode === 'present') {
      return presentRows
        .map((row) => memberById.get(row.id))
        .filter((m): m is Member => !!m);
    }
    return absentRows
      .map((row) => memberById.get(row.id))
      .filter((m): m is Member => !!m);
  }, [listMode, members, memberTypeFilter, absentRows, presentRows, memberById]);

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Pessoas</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {members?.length || 0} {members?.length === 1 ? 'pessoa' : 'pessoas'} no grupo
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {members && members.length > 0 && <BroadcastDialogClient members={members} />}
          <LinkButton href="/pessoas/novo" className="w-full sm:w-auto">
            <UserPlus className="mr-2 h-4 w-4 shrink-0" />
            Nova Pessoa
          </LinkButton>
        </div>
      </div>

      {members && members.length > 0 && (
        <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
          <p className="text-sm font-medium">Filtrar lista</p>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Presença:</span>
            <Button
              variant={listMode === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('all')}
            >
              Todos
            </Button>
            <Button
              variant={listMode === 'absent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('absent')}
            >
              Faltantes
            </Button>
            <Button
              variant={listMode === 'present' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('present')}
            >
              Presentes (último encontro)
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Tipo:</span>
            <Button
              variant={memberTypeFilter === 'total' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMemberTypeFilter('total')}
            >
              Todos
            </Button>
            <Button
              variant={memberTypeFilter === 'participants' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMemberTypeFilter('participants')}
            >
              Participantes
            </Button>
            <Button
              variant={memberTypeFilter === 'visitors' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMemberTypeFilter('visitors')}
            >
              Visitantes
            </Button>
          </div>
          {listMode === 'absent' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Critério de faltas:</span>
              <Button
                variant={absentMetricMode === 'most_absent' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAbsentMetricMode('most_absent')}
              >
                Mais faltantes
              </Button>
              <Button
                variant={absentMetricMode === 'consecutive' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAbsentMetricMode('consecutive')}
              >
                Faltas seguidas
              </Button>
              <Button
                variant={absentMetricMode === 'month' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAbsentMetricMode('month')}
              >
                Faltas no mês
              </Button>
              {absentMetricMode === 'month' && (
                <input
                  type="month"
                  className="border rounded-md px-2 py-1 text-sm bg-background"
                  value={absentYearMonth}
                  onChange={(e) => setAbsentYearMonth(e.target.value)}
                />
              )}
            </div>
          )}
          {listMode === 'absent' && absentMetricMode !== 'month' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground">Janela:</span>
              <Button
                variant={absentScope === 'last10' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAbsentScope('last10')}
              >
                Últimos 10 encontros
              </Button>
              <Button
                variant={absentScope === 'all' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAbsentScope('all')}
              >
                Todos os encontros
              </Button>
            </div>
          )}
          {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        </div>
      )}

      {members && members.length > 0 ? (
        displayedMembers.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {displayedMembers.map((member) => (
              <PessoaCard key={member.id} member={member} canDelete={canDelete} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border rounded-lg text-muted-foreground text-sm">
            Ninguém corresponde a este filtro no momento.
          </div>
        )
      ) : (
        <div className="text-center py-12 border rounded-lg">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma pessoa cadastrada</h3>
          <p className="text-muted-foreground mb-4">Comece adicionando membros ao seu grupo</p>
          <LinkButton href="/pessoas/novo">
            <UserPlus className="mr-2 h-4 w-4" />
            Cadastrar Primeira Pessoa
          </LinkButton>
        </div>
      )}
    </div>
  );
}
