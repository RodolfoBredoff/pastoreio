'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Member } from '@/lib/db/queries';
import type { Period, MemberFilter, PresenceFilter } from '@/components/dashboard/engagement-filter-controls';
import {
  PeriodSelector,
  MemberFilterSelector,
  PresenceFilterSelector,
} from '@/components/dashboard/engagement-filter-controls';
import { Loader2 } from 'lucide-react';

interface MemberStatRow {
  id?: string;
  name: string;
  type: string;
  presences: number;
  absences: number;
  taxa: number;
}

interface MeetingItem {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_type?: string;
  label: string;
}

interface TitleGroupRow {
  title: string;
  count: number;
  latest_date: string;
}

interface PessoasEngagementPanelProps {
  members: Member[];
  onFilteredMembersChange: (filtered: Member[]) => void;
}

export function PessoasEngagementPanel({ members, onFilteredMembersChange }: PessoasEngagementPanelProps) {
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const [view, setView] = useState<Period | 'meeting' | 'title_group'>('monthly');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('total');
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('all');
  const [titleFilter, setTitleFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [memberStats, setMemberStats] = useState<MemberStatRow[]>([]);
  const [meetingList, setMeetingList] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [debouncedTitle, setDebouncedTitle] = useState(titleFilter);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(titleFilter), 400);
    return () => clearTimeout(t);
  }, [titleFilter]);

  const fetchPeriodData = useCallback(
    async (period: Period, title?: string, yearMonth?: string) => {
      setLoading(true);
      try {
        let url = `/api/engagement?period=${period}&member_filter=${memberFilter}`;
        if (title?.trim()) url += `&title_filter=${encodeURIComponent(title.trim())}`;
        if (period === 'monthly' && yearMonth) url += `&year_month=${encodeURIComponent(yearMonth)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        setMemberStats(data.memberStats ?? []);
        setMeetingList(data.meetingList ?? []);
      } finally {
        setLoading(false);
      }
    },
    [memberFilter]
  );

  useEffect(() => {
    if (view === 'monthly') {
      fetch('/api/engagement?mode=available_months')
        .then((r) => (r.ok ? r.json() : { yearMonths: [] }))
        .then((d) => setAvailableMonths(d.yearMonths ?? []));
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'meeting' && view !== 'title_group') {
      const yearMonth = view === 'monthly' && selectedMonth ? selectedMonth : undefined;
      fetchPeriodData(view as Period, debouncedTitle, yearMonth);
    } else if (view === 'meeting') {
      fetchPeriodData('monthly', debouncedTitle);
    }
  }, [view, selectedMonth, fetchPeriodData, debouncedTitle]);

  // ─── Por encontro ───────────────────────────────────────────────────────
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingAttendance, setMeetingAttendance] = useState<
    { member_id: string; member_name: string; member_type: string; is_present: boolean }[]
  >([]);

  useEffect(() => {
    if (view !== 'meeting' || !selectedMeetingId) {
      setMeetingAttendance([]);
      return;
    }
    setMeetingLoading(true);
    let url = `/api/engagement?meeting_id=${selectedMeetingId}&member_filter=${memberFilter}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setMeetingAttendance(data?.attendance ?? []);
      })
      .finally(() => setMeetingLoading(false));
  }, [view, selectedMeetingId, memberFilter]);

  useEffect(() => {
    if (view !== 'meeting' || meetingList.length === 0) return;
    setSelectedMeetingId((prev) =>
      prev && meetingList.some((m) => m.id === prev) ? prev : meetingList[0].id
    );
  }, [view, meetingList]);

  // ─── Por nome (título) ──────────────────────────────────────────────────
  const [titleGroups, setTitleGroups] = useState<TitleGroupRow[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [groupMemberStats, setGroupMemberStats] = useState<MemberStatRow[]>([]);
  const [loadingGroupDetail, setLoadingGroupDetail] = useState(false);

  useEffect(() => {
    if (view !== 'title_group') return;
    setLoadingGroups(true);
    fetch('/api/engagement?mode=title_groups')
      .then((r) => (r.ok ? r.json() : { titleGroups: [] }))
      .then((d) => {
        setTitleGroups(d.titleGroups ?? []);
        setLoadingGroups(false);
      })
      .catch(() => setLoadingGroups(false));
  }, [view]);

  const loadGroupDetail = useCallback(
    async (title: string) => {
      setLoadingGroupDetail(true);
      try {
        const url = `/api/engagement?title_group=${encodeURIComponent(title)}&member_filter=${memberFilter}`;
        const res = await fetch(url);
        const data = res.ok ? await res.json() : { memberStats: [] };
        setGroupMemberStats(data.memberStats ?? []);
      } finally {
        setLoadingGroupDetail(false);
      }
    },
    [memberFilter]
  );

  useEffect(() => {
    if (view !== 'title_group') {
      setGroupMemberStats([]);
      return;
    }
    if (!selectedTitle) {
      setGroupMemberStats([]);
      return;
    }
    loadGroupDetail(selectedTitle);
  }, [view, memberFilter, selectedTitle, loadGroupDetail]);

  // ─── Resolver lista de Member para o grid ──────────────────────────────
  useEffect(() => {
    const applyPresence = (stats: MemberStatRow[]) => {
      const base =
        presenceFilter === 'absent'
          ? stats.filter((m) => m.absences > 0)
          : presenceFilter === 'present'
            ? stats.filter((m) => m.presences > 0)
            : stats;
      return base
        .map((s) => (s.id ? memberById.get(s.id) : undefined))
        .filter((m): m is Member => !!m);
    };

    if (view === 'title_group') {
      onFilteredMembersChange(applyPresence(groupMemberStats));
      return;
    }

    if (view === 'meeting') {
      const rows = meetingAttendance.filter((a) => {
        if (presenceFilter === 'absent') return !a.is_present;
        if (presenceFilter === 'present') return a.is_present;
        return true;
      });
      const typeOk = (t: string) =>
        memberFilter === 'total' ||
        (memberFilter === 'participants' && t === 'participant') ||
        (memberFilter === 'visitors' && t === 'visitor');
      const list = rows
        .filter((a) => typeOk(a.member_type))
        .map((a) => memberById.get(a.member_id))
        .filter((m): m is Member => !!m);
      onFilteredMembersChange(list);
      return;
    }

    onFilteredMembersChange(applyPresence(memberStats));
  }, [
    view,
    memberStats,
    groupMemberStats,
    meetingAttendance,
    presenceFilter,
    memberFilter,
    memberById,
    onFilteredMembersChange,
  ]);

  return (
    <div className="space-y-3">
      <PeriodSelector
        selected={view}
        onChange={setView}
        titleFilter={titleFilter}
        onTitleFilterChange={setTitleFilter}
        monthFilter={selectedMonth}
        onMonthFilterChange={setSelectedMonth}
        availableMonths={availableMonths.length > 0 ? availableMonths : undefined}
      />
      <MemberFilterSelector value={memberFilter} onChange={setMemberFilter} />
      <PresenceFilterSelector value={presenceFilter} onChange={setPresenceFilter} />

      {view === 'meeting' && (
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Encontro</label>
          <select
            value={selectedMeetingId}
            onChange={(e) => setSelectedMeetingId(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {meetingList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          {meetingLoading && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando presenças…
            </p>
          )}
        </div>
      )}

      {view === 'title_group' && (
        <div className="space-y-2">
          {loadingGroups ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : titleGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum título de encontro encontrado.</p>
          ) : (
            <>
              <label className="text-sm text-muted-foreground">Nome do encontro (título)</label>
              <select
                value={selectedTitle ?? ''}
                onChange={(e) => setSelectedTitle(e.target.value || null)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {titleGroups.map((g) => (
                  <option key={g.title} value={g.title}>
                    {g.title} ({g.count})
                  </option>
                ))}
              </select>
              {loadingGroupDetail && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                </p>
              )}
            </>
          )}
        </div>
      )}

      {(loading && view !== 'meeting' && view !== 'title_group') ||
      (loading && view === 'title_group' && !selectedTitle) ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando dados de engajamento…
        </div>
      ) : null}
    </div>
  );
}
