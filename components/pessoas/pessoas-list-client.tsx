'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PessoaCard } from '@/components/pessoas/pessoa-card';
import { BroadcastDialogClient } from '@/components/pessoas/broadcast-dialog-client';
import { PessoasEngagementPanel } from '@/components/pessoas/pessoas-engagement-panel';
import { PessoasTagChartsPanel } from '@/components/pessoas/pessoas-tag-charts-panel';
import { BulkMemberTagsDialog } from '@/components/pessoas/bulk-member-tags-dialog';
import { IntegrationStagesPanel } from '@/components/pessoas/integration-stages-panel';
import { LinkButton } from '@/components/ui/link-button';
import { Button } from '@/components/ui/button';
import { UserPlus, Users, Download } from 'lucide-react';
import type { Member } from '@/lib/db/queries';

function exportMembersCSV(members: Member[]) {
  const headers = ['Nome', 'Tipo', 'Telefone', 'Data de Nascimento', 'Ativo'];
  const rows = members.map((m) => [
    m.full_name,
    m.member_type === 'participant' ? 'Participante' : 'Visitante',
    m.phone || '',
    m.birth_date ? m.birth_date.split('T')[0] : '',
    m.is_active ? 'Sim' : 'Não',
  ]);
  const csvContent = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `membros-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type ListMode = 'all' | 'absent' | 'engagement' | 'stages' | 'not_participated_year';
type MemberTypeFilter = 'total' | 'participants' | 'visitors';
type AbsentMetricMode = 'most_absent' | 'consecutive' | 'month';
type AbsentWindow = 'all' | 'last5';

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
  const [showInactive, setShowInactive] = useState(false);
  const [absentMetricMode, setAbsentMetricMode] = useState<AbsentMetricMode>('most_absent');
  const [absentYearMonth, setAbsentYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [absentWindow, setAbsentWindow] = useState<AbsentWindow>('all');
  const [absentRows, setAbsentRows] = useState<AbsentRow[]>([]);
  const [loadingAbsent, setLoadingAbsent] = useState(false);
  const [engagementMembers, setEngagementMembers] = useState<Member[]>([]);
  const [tagsEpoch, setTagsEpoch] = useState(0);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const bumpTags = useCallback(() => setTagsEpoch((n) => n + 1), []);

  const toggleMemberSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setEngagementFiltered = useCallback((list: Member[]) => {
    setEngagementMembers(list);
  }, []);

  useEffect(() => {
    if (listMode !== 'engagement') setEngagementMembers([]);
  }, [listMode]);

  useEffect(() => {
    if (listMode !== 'all') {
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  }, [listMode]);

  useEffect(() => {
    if (listMode !== 'absent' && listMode !== 'not_participated_year') return;
    if (listMode === 'not_participated_year') {
      setLoadingAbsent(true);
      const currentYear = new Date().getFullYear();
      fetch(`/api/integration-stages/members?stage=nao_participou_ano`)
        .then((r) => (r.ok ? r.json() : { members: [] }))
        .then((data: { members: AbsentRow[] }) => {
          setAbsentRows(data.members || []);
        })
        .catch(() => setAbsentRows([]))
        .finally(() => setLoadingAbsent(false));
      return;
    }
    setLoadingAbsent(true);
    const params = new URLSearchParams({
      presence: 'absent',
      member_filter: memberTypeFilter,
      limit: '200',
    });
    if (absentMetricMode === 'most_absent') {
      params.set('mode', 'most_absent');
      params.set('scope', absentWindow === 'all' ? 'all' : 'last5');
    } else if (absentMetricMode === 'month') {
      params.set('mode', 'month');
      params.set('year_month', absentYearMonth);
    } else {
      params.set('mode', 'consecutive');
      params.set('scope', absentWindow === 'all' ? 'all' : 'last5');
    }
    fetch(`/api/members/absent?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AbsentRow[]) => setAbsentRows(data))
      .catch(() => setAbsentRows([]))
      .finally(() => setLoadingAbsent(false));
  }, [listMode, memberTypeFilter, absentMetricMode, absentYearMonth, absentWindow]);

  const displayedMembers = useMemo(() => {
    if (listMode === 'all') {
      return filterByMemberType(members, memberTypeFilter).sort((a, b) =>
        a.full_name.localeCompare(b.full_name, 'pt-BR')
      );
    }
    if (listMode === 'engagement') {
      return engagementMembers;
    }
    return absentRows
      .map((row) => memberById.get(row.id))
      .filter((m): m is Member => !!m);
  }, [listMode, members, memberTypeFilter, absentRows, engagementMembers, memberById]);

  const forBroadcast =
    displayedMembers.length > 0 ? displayedMembers : listMode === 'all' ? members : [];

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Pessoas</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {members?.length || 0} {members?.length === 1 ? 'pessoa' : 'pessoas'} no grupo
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {members && members.length > 0 && forBroadcast.length > 0 && (
            <BroadcastDialogClient members={forBroadcast} />
          )}
          {members && members.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMembersCSV(displayedMembers.length > 0 ? displayedMembers : members)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          )}
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
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-xs">Mostrar inativos</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Modo:</span>
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
              variant={listMode === 'engagement' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('engagement')}
            >
              Por engajamento
            </Button>
            <Button
              variant={listMode === 'stages' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('stages')}
            >
              Estágios de Integração
            </Button>
            <Button
              variant={listMode === 'not_participated_year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setListMode('not_participated_year')}
            >
              Não Participou Este Ano
            </Button>
          </div>
          {listMode !== 'engagement' && listMode !== 'stages' && listMode !== 'not_participated_year' && (
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
          )}
          {listMode === 'absent' && (
            <>
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
              {absentMetricMode !== 'month' && (
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Janela:</span>
                  <Button
                    variant={absentWindow === 'last5' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setAbsentWindow('last5')}
                  >
                    Últimos 5 encontros
                  </Button>
                  <Button
                    variant={absentWindow === 'all' ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() => setAbsentWindow('all')}
                  >
                    Todos os encontros
                  </Button>
                </div>
              )}
            </>
          )}
          {listMode === 'engagement' && (
            <PessoasEngagementPanel members={members} onFilteredMembersChange={setEngagementFiltered} />
          )}
          {listMode === 'stages' && (
            <IntegrationStagesPanel />
          )}
          {loadingAbsent && listMode === 'absent' && (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          )}
        </div>
      )}

      {members && members.length > 0 && (
        <PessoasTagChartsPanel tagsRefreshSignal={tagsEpoch} />
      )}

      {listMode === 'all' && members.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            type="button"
            variant={selectionMode ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectionMode((m) => {
                if (m) setSelectedIds(new Set());
                return !m;
              });
            }}
          >
            {selectionMode ? 'Cancelar seleção' : 'Selecionar para etiquetar'}
          </Button>
          {selectionMode && selectedIds.size > 0 && (
            <Button type="button" size="sm" onClick={() => setBulkTagOpen(true)}>
              Etiquetar {selectedIds.size} selecionada{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}

      <BulkMemberTagsDialog
        open={bulkTagOpen}
        onOpenChange={setBulkTagOpen}
        memberIds={[...selectedIds]}
        onApplied={() => {
          bumpTags();
          setSelectedIds(new Set());
          setSelectionMode(false);
        }}
      />

      {members && members.length > 0 ? (
        displayedMembers.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {displayedMembers.map((member) => (
              <PessoaCard
                key={member.id}
                member={member}
                canDelete={canDelete}
                selectionMode={listMode === 'all' && selectionMode}
                selected={selectedIds.has(member.id)}
                onToggleSelect={toggleMemberSelect}
                onTagsChanged={bumpTags}
              />
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
