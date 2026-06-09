'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, UserPlus, RotateCcw, Save, Download, Pencil, Trash2 } from 'lucide-react';
import {
  internalCheckKeyMember,
  internalCheckKeyGuest,
  internalCheckKeyPublic,
  normalizeInternalChecks,
  getPair,
  emptyCheckPair,
  type InternalCheckPair,
} from '@/lib/attendance-list-internal';

interface MemberResponse {
  status: string;
  email: string | null;
  phone: string | null;
}

interface MemberRow {
  id: string;
  full_name: string;
  response: MemberResponse | null;
}

interface GuestRow {
  id: string;
  full_name: string;
  registered_by_email: string | null;
  registered_by_phone: string | null;
  registered_by_leader?: boolean;
}

interface PublicEntryRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  rg: string | null;
  created_at: string;
}

interface ListData {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
    notes: string | null;
    attendance_list_deadline?: string | null;
    attendance_list_mode?: 'prefilled' | 'open' | null;
    attendance_list_require_rg?: boolean;
    attendance_list_limit?: number | null;
    attendance_list_internal_label?: string | null;
    attendance_list_internal_checks?: Record<string, InternalCheckPair>;
    attendance_list_internal_enabled?: boolean;
    attendance_list_internal_result_positive?: string | null;
    attendance_list_internal_result_negative?: string | null;
    attendance_list_internal_unmarked_label?: string | null;
  };
  members: MemberRow[];
  guests: GuestRow[];
  public_entries?: PublicEntryRow[];
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

function formatPhone(p: string | null) {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p;
}

function contactDisplay(r: MemberResponse | null): string {
  if (!r) return '—';
  if (r.email) return r.email;
  if (r.phone) return formatPhone(r.phone);
  return '—';
}

function guestRegisteredBy(g: GuestRow): string {
  if (g.registered_by_leader) return 'Inclusão pelo líder';
  if (g.registered_by_email) return g.registered_by_email;
  if (g.registered_by_phone) return formatPhone(g.registered_by_phone);
  return '—';
}

function publicEntryContactDisplay(e: PublicEntryRow): string {
  if (e.email) return e.email;
  if (e.phone) return formatPhone(e.phone);
  return '—';
}

function checksEqualForRows(
  a: Record<string, InternalCheckPair>,
  b: Record<string, InternalCheckPair>,
  memberIds: string[],
  guestIds: string[],
  publicEntryIds: string[]
): boolean {
  for (const id of memberIds) {
    const k = internalCheckKeyMember(id);
    const pa = a[k] ?? emptyCheckPair();
    const pb = b[k] ?? emptyCheckPair();
    if (pa.a !== pb.a || pa.b !== pb.b) return false;
  }
  for (const id of guestIds) {
    const k = internalCheckKeyGuest(id);
    const pa = a[k] ?? emptyCheckPair();
    const pb = b[k] ?? emptyCheckPair();
    if (pa.a !== pb.a || pa.b !== pb.b) return false;
  }
  for (const id of publicEntryIds) {
    const k = internalCheckKeyPublic(id);
    const pa = a[k] ?? emptyCheckPair();
    const pb = b[k] ?? emptyCheckPair();
    if (pa.a !== pb.a || pa.b !== pb.b) return false;
  }
  return true;
}

function syncInternalStateFromMeeting(d: ListData) {
  const m = d.meeting;
  return {
    label: m.attendance_list_internal_label ?? '',
    checks: normalizeInternalChecks(m.attendance_list_internal_checks as Record<string, unknown> ?? {}),
    enabled: m.attendance_list_internal_enabled ?? false,
    resultPositive: m.attendance_list_internal_result_positive ?? '',
    resultNegative: m.attendance_list_internal_result_negative ?? '',
    unmarked: m.attendance_list_internal_unmarked_label ?? '',
  };
}

export default function ListaConfirmacaoPage() {
  const params = useParams();
  const meetingId = params?.id as string | undefined;

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [internalLabel, setInternalLabel] = useState('');
  const [internalChecks, setInternalChecks] = useState<Record<string, InternalCheckPair>>({});
  const [internalEnabled, setInternalEnabled] = useState(false);
  const [internalResultPositive, setInternalResultPositive] = useState('');
  const [internalResultNegative, setInternalResultNegative] = useState('');
  const [internalUnmarked, setInternalUnmarked] = useState('');
  const [internalSaving, setInternalSaving] = useState(false);
  const [checklistSaveOk, setChecklistSaveOk] = useState(false);
  const [leaderGuestFirst, setLeaderGuestFirst] = useState('');
  const [leaderGuestLast, setLeaderGuestLast] = useState('');
  const [leaderGuestSaving, setLeaderGuestSaving] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingInfoSaving, setMeetingInfoSaving] = useState(false);
  const [meetingInfoSaved, setMeetingInfoSaved] = useState(false);
  const [meetingListRequireRg, setMeetingListRequireRg] = useState(false);
  const [meetingListLimit, setMeetingListLimit] = useState('');
  
  // Public entries management
  const [publicEntryFirst, setPublicEntryFirst] = useState('');
  const [publicEntryLast, setPublicEntryLast] = useState('');
  const [publicEntryEmail, setPublicEntryEmail] = useState('');
  const [publicEntryPhone, setPublicEntryPhone] = useState('');
  const [publicEntryRg, setPublicEntryRg] = useState('');
  const [publicEntryUsePhone, setPublicEntryUsePhone] = useState(false);
  const [publicEntrySaving, setPublicEntrySaving] = useState(false);
  
  // Edit dialog
  const [editingEntry, setEditingEntry] = useState<PublicEntryRow | null>(null);
  const [editEntryFirst, setEditEntryFirst] = useState('');
  const [editEntryLast, setEditEntryLast] = useState('');
  const [editEntryEmail, setEditEntryEmail] = useState('');
  const [editEntryPhone, setEditEntryPhone] = useState('');
  const [editEntryRg, setEditEntryRg] = useState('');
  const [editEntryUsePhone, setEditEntryUsePhone] = useState(false);
  const [editEntrySaving, setEditEntrySaving] = useState(false);
  
  /** Evita sobrescrever rascunho do checklist ao recarregar só membros/confirmações */
  const checklistDraftDirtyRef = useRef(false);

  const fetchList = () => {
    if (!meetingId) return;
    fetch(`/api/meetings/${meetingId}/attendance-list`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Erro ao carregar')));
        return res.json();
      })
      .then((d) => {
        setData(d);
        setMeetingTitle(d.meeting.title ?? '');
        setMeetingLocation(d.meeting.location ?? '');
        setMeetingNotes(d.meeting.notes ?? '');
        setMeetingListRequireRg(d.meeting.attendance_list_require_rg ?? false);
        setMeetingListLimit(
          d.meeting.attendance_list_limit != null ? String(d.meeting.attendance_list_limit) : ''
        );
        if (!checklistDraftDirtyRef.current) {
          const s = syncInternalStateFromMeeting(d);
          setInternalLabel(s.label);
          setInternalChecks(s.checks);
          setInternalEnabled(s.enabled);
          setInternalResultPositive(s.resultPositive);
          setInternalResultNegative(s.resultNegative);
          setInternalUnmarked(s.unmarked);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'));
  };

  const saveInternalChecklist = async () => {
    if (!meetingId || !data) return;
    setInternalSaving(true);
    setChecklistSaveOk(false);
    setError(null);
    try {
      const labelVal = internalLabel.trim() === '' ? null : internalLabel.trim();
      const fullChecks: Record<string, InternalCheckPair> = {};
      for (const m of data.members) {
        const k = internalCheckKeyMember(m.id);
        fullChecks[k] = internalChecks[k] ?? emptyCheckPair();
      }
      for (const g of data.guests) {
        const k = internalCheckKeyGuest(g.id);
        fullChecks[k] = internalChecks[k] ?? emptyCheckPair();
      }
      // Incluir public_entries
      const publicEntries = data.public_entries ?? [];
      for (const e of publicEntries) {
        const k = internalCheckKeyPublic(e.id);
        fullChecks[k] = internalChecks[k] ?? emptyCheckPair();
      }
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internal_enabled: internalEnabled,
          internal_label: labelVal,
          internal_result_positive:
            internalResultPositive.trim() === '' ? null : internalResultPositive.trim().slice(0, 120),
          internal_result_negative:
            internalResultNegative.trim() === '' ? null : internalResultNegative.trim().slice(0, 120),
          internal_unmarked_label:
            internalUnmarked.trim() === '' ? null : internalUnmarked.trim().slice(0, 120),
          internal_checks: fullChecks,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      fetch(`/api/meetings/${meetingId}/attendance-list`)
        .then((r) => {
          if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.error || 'Erro ao carregar')));
          return r.json();
        })
        .then((d) => {
          setData(d);
          const s = syncInternalStateFromMeeting(d);
          setInternalLabel(s.label);
          setInternalChecks(s.checks);
          setInternalEnabled(s.enabled);
          setInternalResultPositive(s.resultPositive);
          setInternalResultNegative(s.resultNegative);
          setInternalUnmarked(s.unmarked);
          setChecklistSaveOk(true);
          setTimeout(() => setChecklistSaveOk(false), 4000);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar checklist');
    } finally {
      setInternalSaving(false);
    }
  };

  const handleInternalToggle = (rowKey: string, field: 'a' | 'b', checked: boolean) => {
    setInternalChecks((prev) => {
      const cur = prev[rowKey] ?? emptyCheckPair();
      return { ...prev, [rowKey]: { ...cur, [field]: checked } };
    });
  };

  const handleAddLeaderGuest = async () => {
    if (!meetingId) return;
    const fn = leaderGuestFirst.trim();
    const ln = leaderGuestLast.trim();
    if (!fn || !ln) {
      setError('Informe nome e sobrenome do visitante.');
      return;
    }
    setLeaderGuestSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: fn, last_name: ln }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao adicionar visitante');
      setLeaderGuestFirst('');
      setLeaderGuestLast('');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar visitante');
    } finally {
      setLeaderGuestSaving(false);
    }
  };

  const handleAddPublicEntry = async () => {
    if (!meetingId) return;
    const fn = publicEntryFirst.trim();
    const ln = publicEntryLast.trim();
    const em = publicEntryEmail.trim();
    const ph = publicEntryPhone.replace(/\D/g, '');
    
    if (!fn || !ln) {
      setError('Informe nome e sobrenome.');
      return;
    }
    
    if (publicEntryUsePhone) {
      if (ph.length < 10) {
        setError('Informe um telefone válido (mín. 10 dígitos com DDD).');
        return;
      }
    } else {
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError('Informe um e-mail válido.');
        return;
      }
    }

    const requireRg = data?.meeting.attendance_list_require_rg ?? false;
    if (requireRg && !publicEntryRg.trim()) {
      setError('Informe o RG.');
      return;
    }
    
    setPublicEntrySaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list/public-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: fn,
          last_name: ln,
          ...(publicEntryUsePhone ? { phone: ph } : { email: em }),
          ...(requireRg ? { rg: publicEntryRg.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao adicionar');
      setPublicEntryFirst('');
      setPublicEntryLast('');
      setPublicEntryEmail('');
      setPublicEntryPhone('');
      setPublicEntryRg('');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally {
      setPublicEntrySaving(false);
    }
  };

  const handleEditPublicEntry = (entry: PublicEntryRow) => {
    setEditingEntry(entry);
    setEditEntryFirst(entry.full_name.split(' ')[0] || '');
    setEditEntryLast(entry.full_name.split(' ').slice(1).join(' ') || '');
    setEditEntryEmail(entry.email || '');
    setEditEntryPhone(entry.phone || '');
    setEditEntryRg(entry.rg || '');
    setEditEntryUsePhone(!!entry.phone && !entry.email);
  };

  const handleSaveEditEntry = async () => {
    if (!meetingId || !editingEntry) return;
    const fn = editEntryFirst.trim();
    const ln = editEntryLast.trim();
    const em = editEntryEmail.trim();
    const ph = editEntryPhone.replace(/\D/g, '');
    
    if (!fn || !ln) {
      setError('Informe nome e sobrenome.');
      return;
    }
    
    if (editEntryUsePhone) {
      if (ph.length < 10) {
        setError('Informe um telefone válido (mín. 10 dígitos com DDD).');
        return;
      }
    } else {
      if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        setError('Informe um e-mail válido.');
        return;
      }
    }

    const requireRg = data?.meeting.attendance_list_require_rg ?? false;
    if (requireRg && !editEntryRg.trim()) {
      setError('Informe o RG.');
      return;
    }
    
    setEditEntrySaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list/public-entries/${editingEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: fn,
          last_name: ln,
          ...(editEntryUsePhone ? { phone: ph, email: null } : { email: em, phone: null }),
          ...(requireRg ? { rg: editEntryRg.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao editar');
      setEditingEntry(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao editar');
    } finally {
      setEditEntrySaving(false);
    }
  };

  const handleDeletePublicEntry = async (entryId: string) => {
    if (!meetingId) return;
    if (!confirm('Remover este registro? Esta ação não pode ser desfeita.')) return;
    
    setActionLoading(`entry-${entryId}`);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list/public-entries/${entryId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao remover');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (!meetingId) {
      setError('Encontro não informado.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`/api/meetings/${meetingId}/attendance-list`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Erro ao carregar')));
        return res.json();
      })
      .then((d) => {
        setData(d);
        setMeetingTitle(d.meeting.title ?? '');
        setMeetingLocation(d.meeting.location ?? '');
        setMeetingNotes(d.meeting.notes ?? '');
        setMeetingListRequireRg(d.meeting.attendance_list_require_rg ?? false);
        setMeetingListLimit(
          d.meeting.attendance_list_limit != null ? String(d.meeting.attendance_list_limit) : ''
        );
        const s = syncInternalStateFromMeeting(d);
        setInternalLabel(s.label);
        setInternalChecks(s.checks);
        setInternalEnabled(s.enabled);
        setInternalResultPositive(s.resultPositive);
        setInternalResultNegative(s.resultNegative);
        setInternalUnmarked(s.unmarked);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const saveMeetingInfo = async () => {
    if (!meetingId || !data) return;
    setMeetingInfoSaving(true);
    setMeetingInfoSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetingTitle.trim() || null,
          location: meetingLocation.trim() || null,
          notes: meetingNotes.trim() || null,
          attendance_list_require_rg: data.meeting.attendance_list_mode === 'open' ? meetingListRequireRg : false,
          attendance_list_limit: meetingListLimit.trim() ? Number(meetingListLimit) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar');
      setMeetingInfoSaved(true);
      setTimeout(() => setMeetingInfoSaved(false), 3000);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar informações');
    } finally {
      setMeetingInfoSaving(false);
    }
  };

  const checklistDirty = useMemo(() => {
    if (!data) return false;
    const m = data.meeting;
    const savedLabel = (m.attendance_list_internal_label ?? '').trim();
    const localLabel = internalLabel.trim();
    const savedPos = (m.attendance_list_internal_result_positive ?? '').trim();
    const localPos = internalResultPositive.trim();
    const savedNeg = (m.attendance_list_internal_result_negative ?? '').trim();
    const localNeg = internalResultNegative.trim();
    const savedUnmarked = (m.attendance_list_internal_unmarked_label ?? '').trim();
    const localUnmarked = internalUnmarked.trim();
    const savedChecks = normalizeInternalChecks(m.attendance_list_internal_checks as Record<string, unknown> ?? {});
    const memberIds = data.members.map((x) => x.id);
    const guestIds = data.guests.map((x) => x.id);
    const publicEntryIds = (data.public_entries ?? []).map((x) => x.id);
    return (
      internalEnabled !== (m.attendance_list_internal_enabled ?? false) ||
      localLabel !== savedLabel ||
      localPos !== savedPos ||
      localNeg !== savedNeg ||
      localUnmarked !== savedUnmarked ||
      !checksEqualForRows(internalChecks, savedChecks, memberIds, guestIds, publicEntryIds)
    );
  }, [
    data,
    internalLabel,
    internalChecks,
    internalEnabled,
    internalResultPositive,
    internalResultNegative,
    internalUnmarked,
  ]);

  useEffect(() => {
    checklistDraftDirtyRef.current = checklistDirty;
  }, [checklistDirty]);

  const handleChangeStatus = async (memberId: string, status: 'present' | 'absent') => {
    setActionLoading(memberId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao alterar');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao alterar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReset = async (memberId: string) => {
    if (!confirm('Resetar a confirmação deste membro? Ele poderá responder novamente pelo link.')) return;
    setActionLoading(memberId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao resetar');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao resetar');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetGuest = async (guestId: string) => {
    if (!confirm('Remover este visitante da lista? O cadastro será apagado.')) return;
    setActionLoading(`guest-${guestId}`);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/attendance-list/guests/${guestId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao remover');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover visitante');
    } finally {
      setActionLoading(null);
    }
  };

  if (!meetingId) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">Encontro não informado.</p>
        <Button variant="outline" asChild><Link href="/agenda">Voltar à Agenda</Link></Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error || 'Não foi possível carregar a lista.'}</p>
        <Button variant="outline" asChild><Link href="/agenda">Voltar à Agenda</Link></Button>
      </div>
    );
  }

  const { meeting, members, guests } = data;
  const publicEntries = data.public_entries ?? [];

  // Se modo é "open" (lista vazia) E checklist interno habilitado:
  // mostrar APENAS public_entries na checklist (não membros/guests)
  const isOpenMode = meeting.attendance_list_mode === 'open';
  const checklistRowKeys = isOpenMode
    ? publicEntries.map((e) => internalCheckKeyPublic(e.id))
    : [
        ...members.map((m) => internalCheckKeyMember(m.id)),
        ...guests.map((g) => internalCheckKeyGuest(g.id)),
      ];
  let countCheckA = 0;
  let countCheckB = 0;
  let countNeither = 0;
  for (const k of checklistRowKeys) {
    const p = getPair(internalChecks, k);
    if (p.a) countCheckA++;
    if (p.b) countCheckB++;
    if (!p.a && !p.b) countNeither++;
  }
  const listNameDisplay = internalLabel.trim() || 'Checklist';
  const headerCheckboxA = internalResultPositive.trim() || 'Opção 1';
  const headerCheckboxB = internalResultNegative.trim() || 'Opção 2';
  const labelResultA = internalResultPositive.trim() || 'Marcado (1º)';
  const labelResultB = internalResultNegative.trim() || 'Marcado (2º)';
  const labelNeither = internalUnmarked.trim() || 'Não marcados';

  const exportAttendanceCSV = () => {
    const includeRg = meeting.attendance_list_require_rg ?? false;
    const headers = includeRg ? ['Nome', 'Resposta', 'Contato', 'RG'] : ['Nome', 'Resposta', 'Contato'];
    const memberRows = members.map((m) => [
      m.full_name,
      m.response?.status === 'present' ? 'Presente' : m.response?.status === 'absent' ? 'Ausente' : '—',
      contactDisplay(m.response),
    ]);
    const guestRows = guests.map((g) => [
      `${g.full_name} (visitante)`,
      '—',
      guestRegisteredBy(g),
    ]);
    const publicRows = publicEntries.map((e) => [
      `${e.full_name} (lista vazia)`,
      'Presente',
      publicEntryContactDisplay(e),
      ...(includeRg ? [e.rg || '—'] : []),
    ]);
    const csvContent = [headers, ...memberRows, ...guestRows, ...publicRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chamada-${meeting.meeting_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/agenda" className="flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Voltar à Agenda
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">Lista de confirmação</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {meeting.title || 'Encontro'} — {formatDate(meeting.meeting_date)}
            {meeting.meeting_time && ` às ${formatTime(meeting.meeting_time)}`}
            {meeting.location && ` · ${meeting.location}`}
            {meeting.attendance_list_limit != null && meeting.attendance_list_limit > 0 && (
              <> · Limite: {publicEntries.length + members.filter((m) => m.response?.status === 'present').length + guests.length} / {meeting.attendance_list_limit}</>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportAttendanceCSV} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h2 className="font-medium">Informações do Encontro</h2>
          <p className="text-xs text-muted-foreground">
            Edite as informações do encontro. As quebras de linha são preservadas nas observações.
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Título (opcional)</Label>
              <Input
                id="meeting-title"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="Ex: Estudo sobre fé"
                disabled={meetingInfoSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-location">Local (opcional)</Label>
              <Input
                id="meeting-location"
                value={meetingLocation}
                onChange={(e) => setMeetingLocation(e.target.value)}
                placeholder="Ex: Casa do João"
                disabled={meetingInfoSaving}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-notes">Observações / Informações (opcional)</Label>
            <textarea
              id="meeting-notes"
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              placeholder="Tema do estudo, avisos, oração do encontro...&#10;Você pode usar múltiplas linhas aqui."
              rows={4}
              disabled={meetingInfoSaving}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y whitespace-pre-wrap"
            />
            {meetingNotes && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                <p className="whitespace-pre-wrap">{meetingNotes}</p>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="meeting-list-limit">Limite de inscrições (opcional)</Label>
              <Input
                id="meeting-list-limit"
                type="number"
                min={1}
                placeholder="Sem limite"
                value={meetingListLimit}
                onChange={(e) => setMeetingListLimit(e.target.value)}
                disabled={meetingInfoSaving}
              />
            </div>
            {meeting.attendance_list_mode === 'open' && (
              <div className="flex items-center space-x-2 sm:pt-8">
                <Checkbox
                  id="meeting-list-require-rg"
                  checked={meetingListRequireRg}
                  onCheckedChange={(c) => setMeetingListRequireRg(c === true)}
                  disabled={meetingInfoSaving}
                />
                <Label htmlFor="meeting-list-require-rg" className="text-sm font-normal cursor-pointer">
                  Exigir RG no formulário de confirmação
                </Label>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={() => void saveMeetingInfo()}
              disabled={meetingInfoSaving}
              className="shrink-0 w-fit"
            >
              {meetingInfoSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar informações
            </Button>
            {meetingInfoSaved && (
              <span className="text-sm text-green-700 dark:text-green-400">Salvo com sucesso!</span>
            )}
          </div>
        </div>
      </div>

      {/* Membros - apenas no modo "prefilled" (pré-preenchida) */}
      {!isOpenMode && (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h2 className="font-medium">Membros</h2>
          <p className="text-xs text-muted-foreground">Resposta e contato de quem confirmou. Use Presente/Ausente para alterar ou Resetar para limpar a confirmação.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">Resposta</th>
                <th className="text-left p-3 font-medium">E-mail / Telefone</th>
                <th className="text-left p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isPresent = m.response?.status === 'present';
                const isAbsent = m.response?.status === 'absent';
                const hasResponse = !!m.response;
                const busy = actionLoading === m.id;
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-3">{m.full_name}</td>
                    <td className="p-3">
                      {m.response ? (
                        m.response.status === 'present' ? (
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <CheckCircle2 className="h-4 w-4" />
                            Presente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <XCircle className="h-4 w-4" />
                            Ausente
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-xs">{contactDisplay(m.response)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          variant={isPresent ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => handleChangeStatus(m.id, 'present')}
                          title="Definir como presente"
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" /> Presente</>}
                        </Button>
                        <Button
                          variant={isAbsent ? 'secondary' : 'outline'}
                          size="sm"
                          className="h-7 text-xs"
                          disabled={busy}
                          onClick={() => handleChangeStatus(m.id, 'absent')}
                          title="Definir como ausente"
                        >
                          <XCircle className="h-3 w-3 mr-1" />
                          Ausente
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          disabled={!hasResponse || busy}
                          onClick={() => handleReset(m.id)}
                          title="Resetar confirmação"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Resetar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h2 className="font-medium flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Visitantes
          </h2>
          <p className="text-xs text-muted-foreground">
            Inclua visitantes a qualquer momento (mesmo após o prazo do link público). Quem se cadastrou pelo link
            aparece com e-mail ou telefone de quem cadastrou.
          </p>
        </div>
        <div className="p-4 border-b space-y-3">
          <p className="text-sm font-medium">Adicionar visitante (líder)</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end max-w-xl">
            <div className="space-y-1 flex-1 min-w-0">
              <Label htmlFor="leader-guest-first">Nome</Label>
              <Input
                id="leader-guest-first"
                value={leaderGuestFirst}
                onChange={(e) => setLeaderGuestFirst(e.target.value)}
                placeholder="Nome"
                disabled={leaderGuestSaving}
              />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <Label htmlFor="leader-guest-last">Sobrenome</Label>
              <Input
                id="leader-guest-last"
                value={leaderGuestLast}
                onChange={(e) => setLeaderGuestLast(e.target.value)}
                placeholder="Sobrenome"
                disabled={leaderGuestSaving}
                onKeyDown={(e) => e.key === 'Enter' && void handleAddLeaderGuest()}
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleAddLeaderGuest()}
              disabled={leaderGuestSaving}
              className="shrink-0"
            >
              {leaderGuestSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adicionar'}
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {guests.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum visitante na lista ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Visitante</th>
                  <th className="text-left p-3 font-medium">Cadastrado por</th>
                  <th className="text-left p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => {
                  const guestBusy = actionLoading === `guest-${g.id}`;
                  return (
                    <tr key={g.id} className="border-b last:border-0">
                      <td className="p-3">{g.full_name}</td>
                      <td className="p-3 font-mono text-xs">{guestRegisteredBy(g)}</td>
                      <td className="p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          disabled={guestBusy}
                          onClick={() => handleResetGuest(g.id)}
                          title="Remover visitante da lista"
                        >
                          {guestBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Remover</>}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50">
          <h2 className="font-medium">Lista vazia (autocadastro)</h2>
          <p className="text-xs text-muted-foreground">
            Registros feitos no modo "lista vazia". Esses dados não aparecem publicamente; só aqui. 
            Você pode adicionar, editar ou remover registros manualmente.
          </p>
        </div>
        
        <div className="p-4 border-b space-y-3 bg-muted/20">
          <p className="text-sm font-medium">Adicionar registro manualmente</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="public-entry-first">Nome</Label>
              <Input
                id="public-entry-first"
                value={publicEntryFirst}
                onChange={(e) => setPublicEntryFirst(e.target.value)}
                placeholder="Nome"
                disabled={publicEntrySaving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="public-entry-last">Sobrenome</Label>
              <Input
                id="public-entry-last"
                value={publicEntryLast}
                onChange={(e) => setPublicEntryLast(e.target.value)}
                placeholder="Sobrenome"
                disabled={publicEntrySaving}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="public-entry-use-phone"
              checked={publicEntryUsePhone}
              onCheckedChange={(c) => setPublicEntryUsePhone(c === true)}
              disabled={publicEntrySaving}
            />
            <Label htmlFor="public-entry-use-phone" className="text-sm font-normal cursor-pointer">
              Usar telefone em vez de e-mail
            </Label>
          </div>
          
          {publicEntryUsePhone ? (
            <div className="space-y-1">
              <Label htmlFor="public-entry-phone">Telefone (com DDD)</Label>
              <Input
                id="public-entry-phone"
                type="tel"
                placeholder="(11) 99999-9999"
                value={publicEntryPhone}
                onChange={(e) => setPublicEntryPhone(e.target.value)}
                disabled={publicEntrySaving}
                onKeyDown={(e) => e.key === 'Enter' && void handleAddPublicEntry()}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="public-entry-email">E-mail</Label>
              <Input
                id="public-entry-email"
                type="email"
                placeholder="exemplo@email.com"
                value={publicEntryEmail}
                onChange={(e) => setPublicEntryEmail(e.target.value)}
                disabled={publicEntrySaving}
                onKeyDown={(e) => e.key === 'Enter' && void handleAddPublicEntry()}
              />
            </div>
          )}

          {meeting.attendance_list_require_rg && (
            <div className="space-y-1">
              <Label htmlFor="public-entry-rg">RG</Label>
              <Input
                id="public-entry-rg"
                placeholder="Ex: 12.345.678-9"
                value={publicEntryRg}
                onChange={(e) => setPublicEntryRg(e.target.value)}
                disabled={publicEntrySaving}
                onKeyDown={(e) => e.key === 'Enter' && void handleAddPublicEntry()}
              />
            </div>
          )}
          
          <Button
            type="button"
            onClick={() => void handleAddPublicEntry()}
            disabled={publicEntrySaving}
            className="shrink-0"
          >
            {publicEntrySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Adicionar
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          {publicEntries.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Nome</th>
                  <th className="text-left p-3 font-medium">E-mail / Telefone</th>
                  {meeting.attendance_list_require_rg && (
                    <th className="text-left p-3 font-medium">RG</th>
                  )}
                  <th className="text-left p-3 font-medium">Quando</th>
                  <th className="text-left p-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {publicEntries.map((e) => {
                  const entryBusy = actionLoading === `entry-${e.id}`;
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="p-3">{e.full_name}</td>
                      <td className="p-3 font-mono text-xs">{publicEntryContactDisplay(e)}</td>
                      {meeting.attendance_list_require_rg && (
                        <td className="p-3 font-mono text-xs">{e.rg || '—'}</td>
                      )}
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={entryBusy}
                            onClick={() => handleEditPublicEntry(e)}
                            title="Editar registro"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground hover:text-destructive"
                            disabled={entryBusy}
                            onClick={() => handleDeletePublicEntry(e.id)}
                            title="Remover registro"
                          >
                            {entryBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remover
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar registro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-entry-first">Nome</Label>
                <Input
                  id="edit-entry-first"
                  value={editEntryFirst}
                  onChange={(e) => setEditEntryFirst(e.target.value)}
                  placeholder="Nome"
                  disabled={editEntrySaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-entry-last">Sobrenome</Label>
                <Input
                  id="edit-entry-last"
                  value={editEntryLast}
                  onChange={(e) => setEditEntryLast(e.target.value)}
                  placeholder="Sobrenome"
                  disabled={editEntrySaving}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-entry-use-phone"
                checked={editEntryUsePhone}
                onCheckedChange={(c) => setEditEntryUsePhone(c === true)}
                disabled={editEntrySaving}
              />
              <Label htmlFor="edit-entry-use-phone" className="text-sm font-normal cursor-pointer">
                Usar telefone em vez de e-mail
              </Label>
            </div>
            
            {editEntryUsePhone ? (
              <div className="space-y-2">
                <Label htmlFor="edit-entry-phone">Telefone (com DDD)</Label>
                <Input
                  id="edit-entry-phone"
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={editEntryPhone}
                  onChange={(e) => setEditEntryPhone(e.target.value)}
                  disabled={editEntrySaving}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="edit-entry-email">E-mail</Label>
                <Input
                  id="edit-entry-email"
                  type="email"
                  placeholder="exemplo@email.com"
                  value={editEntryEmail}
                  onChange={(e) => setEditEntryEmail(e.target.value)}
                  disabled={editEntrySaving}
                />
              </div>
            )}

            {data?.meeting.attendance_list_require_rg && (
              <div className="space-y-2">
                <Label htmlFor="edit-entry-rg">RG</Label>
                <Input
                  id="edit-entry-rg"
                  placeholder="Ex: 12.345.678-9"
                  value={editEntryRg}
                  onChange={(e) => setEditEntryRg(e.target.value)}
                  disabled={editEntrySaving}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)} disabled={editEntrySaving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSaveEditEntry()} disabled={editEntrySaving}>
              {editEntrySaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/50 space-y-1">
          <h2 className="font-medium">Checklist interno</h2>
          <p className="text-xs text-muted-foreground">
            {isOpenMode 
              ? 'Opcional. Dois checkboxes por pessoa (autocadastro). Conforme as pessoas se cadastram no link público, elas aparecem aqui automaticamente. Nomeie a lista (ex.: Pagamento) e cada checkbox (ex.: Pago e A pagar). Salve para registrar.'
              : 'Opcional. Dois checkboxes por pessoa (participantes e convidados). Nomeie a lista (ex.: Pagamento) e cada checkbox (ex.: Pago e A pagar). Salve para registrar.'
            }
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
            <Checkbox
              id="internal-enabled"
              checked={internalEnabled}
              onCheckedChange={(c) => setInternalEnabled(c === true)}
              disabled={internalSaving}
            />
            <div className="space-y-0.5">
              <Label htmlFor="internal-enabled" className="text-sm font-medium cursor-pointer">
                Usar checklist neste encontro
              </Label>
              <p className="text-xs text-muted-foreground">
                Desmarcado: nada é exibido abaixo; seus dados salvos permanecem no banco se já existiam.
              </p>
            </div>
          </div>

          {internalEnabled && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 max-w-3xl">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="internal-checklist-label">Nome da lista de checklist (ex.: Pagamento)</Label>
                  <Input
                    id="internal-checklist-label"
                    placeholder="Ex.: Pagamento, Material, Contribuição…"
                    value={internalLabel}
                    onChange={(e) => setInternalLabel(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-result-pos">Nome do 1º checkbox</Label>
                  <Input
                    id="internal-result-pos"
                    placeholder="Ex.: Pago"
                    value={internalResultPositive}
                    onChange={(e) => setInternalResultPositive(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-result-neg">Nome do 2º checkbox</Label>
                  <Input
                    id="internal-result-neg"
                    placeholder="Ex.: A pagar"
                    value={internalResultNegative}
                    onChange={(e) => setInternalResultNegative(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="internal-unmarked">Texto para quem não marcou nenhum dos dois</Label>
                  <Input
                    id="internal-unmarked"
                    placeholder="Padrão: Não marcados"
                    value={internalUnmarked}
                    onChange={(e) => setInternalUnmarked(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="button"
                  onClick={() => void saveInternalChecklist()}
                  disabled={internalSaving || !checklistDirty}
                  className="shrink-0 w-fit"
                >
                  {internalSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar checklist
                </Button>
                {checklistSaveOk && (
                  <span className="text-sm text-green-700 dark:text-green-400">Checklist salvo com sucesso.</span>
                )}
              </div>

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium min-w-[140px]">Nome</th>
                      <th className="text-center p-3 font-medium w-28">{headerCheckboxA}</th>
                      <th className="text-center p-3 font-medium w-28">{headerCheckboxB}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isOpenMode ? (
                      // Modo "lista vazia": mostrar apenas public_entries
                      publicEntries.map((e) => {
                        const rk = internalCheckKeyPublic(e.id);
                        const p = getPair(internalChecks, rk);
                        return (
                          <tr key={e.id} className="border-b last:border-0">
                            <td className="p-3">
                              <span className="font-medium">{e.full_name}</span>
                              <span className="block text-xs text-muted-foreground">Autocadastro</span>
                            </td>
                            <td className="p-3 text-center">
                              <Checkbox
                                checked={p.a}
                                onCheckedChange={(c) => handleInternalToggle(rk, 'a', c === true)}
                                disabled={internalSaving}
                                aria-label={`${headerCheckboxA} — ${e.full_name}`}
                              />
                            </td>
                            <td className="p-3 text-center">
                              <Checkbox
                                checked={p.b}
                                onCheckedChange={(c) => handleInternalToggle(rk, 'b', c === true)}
                                disabled={internalSaving}
                                aria-label={`${headerCheckboxB} — ${e.full_name}`}
                              />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      // Modo "prefilled": mostrar members + guests (comportamento original)
                      <>
                        {members.map((m) => {
                          const rk = internalCheckKeyMember(m.id);
                          const p = getPair(internalChecks, rk);
                          return (
                            <tr key={m.id} className="border-b last:border-0">
                              <td className="p-3">
                                <span className="font-medium">{m.full_name}</span>
                                <span className="block text-xs text-muted-foreground">Participante</span>
                              </td>
                              <td className="p-3 text-center">
                                <Checkbox
                                  checked={p.a}
                                  onCheckedChange={(c) => handleInternalToggle(rk, 'a', c === true)}
                                  disabled={internalSaving}
                                  aria-label={`${headerCheckboxA} — ${m.full_name}`}
                                />
                              </td>
                              <td className="p-3 text-center">
                                <Checkbox
                                  checked={p.b}
                                  onCheckedChange={(c) => handleInternalToggle(rk, 'b', c === true)}
                                  disabled={internalSaving}
                                  aria-label={`${headerCheckboxB} — ${m.full_name}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                        {guests.map((g) => {
                          const rk = internalCheckKeyGuest(g.id);
                          const p = getPair(internalChecks, rk);
                          return (
                            <tr key={`g-${g.id}`} className="border-b last:border-0 bg-muted/20">
                              <td className="p-3">
                                <span className="font-medium">{g.full_name}</span>
                                <span className="block text-xs text-muted-foreground">Convidado</span>
                              </td>
                              <td className="p-3 text-center">
                                <Checkbox
                                  checked={p.a}
                                  onCheckedChange={(c) => handleInternalToggle(rk, 'a', c === true)}
                                  disabled={internalSaving}
                                  aria-label={`${headerCheckboxA} — ${g.full_name}`}
                                />
                              </td>
                              <td className="p-3 text-center">
                                <Checkbox
                                  checked={p.b}
                                  onCheckedChange={(c) => handleInternalToggle(rk, 'b', c === true)}
                                  disabled={internalSaving}
                                  aria-label={`${headerCheckboxB} — ${g.full_name}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
                {(isOpenMode ? publicEntries.length === 0 : (members.length === 0 && guests.length === 0)) && (
                  <p className="p-4 text-sm text-muted-foreground">Não há linhas para marcar.</p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-2">
                <p className="font-semibold text-foreground">{listNameDisplay}</p>
                <ul className="text-muted-foreground space-y-1 list-none pl-0">
                  <li>
                    {labelResultA}:{' '}
                    <span className="font-semibold text-foreground">{countCheckA}</span>
                  </li>
                  <li>
                    {labelResultB}:{' '}
                    <span className="font-semibold text-foreground">{countCheckB}</span>
                  </li>
                  <li>
                    {labelNeither}:{' '}
                    <span className="font-semibold text-foreground">{countNeither}</span>
                  </li>
                </ul>
              </div>
            </>
          )}

          {!internalEnabled && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <Button
                type="button"
                onClick={() => void saveInternalChecklist()}
                disabled={internalSaving || !checklistDirty}
                className="shrink-0 w-fit"
              >
                {internalSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar preferências do checklist
              </Button>
              {checklistSaveOk && (
                <span className="text-sm text-green-700 dark:text-green-400">Salvo.</span>
              )}
            </div>
          )}
        </div>
      </div>

      <Button variant="outline" asChild>
        <Link href="/agenda">Voltar à Agenda</Link>
      </Button>
    </div>
  );
}
