'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, UserPlus, RotateCcw, Save } from 'lucide-react';
import {
  internalCheckKeyMember,
  internalCheckKeyGuest,
  normalizeInternalChecks,
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

interface ListData {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
    attendance_list_deadline?: string | null;
    attendance_list_internal_label?: string | null;
    attendance_list_internal_checks?: Record<string, boolean>;
    attendance_list_internal_enabled?: boolean;
    attendance_list_internal_result_positive?: string | null;
    attendance_list_internal_result_negative?: string | null;
  };
  members: MemberRow[];
  guests: GuestRow[];
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

function checksEqualForRows(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
  memberIds: string[],
  guestIds: string[]
): boolean {
  for (const id of memberIds) {
    const k = internalCheckKeyMember(id);
    if (Boolean(a[k]) !== Boolean(b[k])) return false;
  }
  for (const id of guestIds) {
    const k = internalCheckKeyGuest(id);
    if (Boolean(a[k]) !== Boolean(b[k])) return false;
  }
  return true;
}

function syncInternalStateFromMeeting(d: ListData) {
  const m = d.meeting;
  return {
    label: m.attendance_list_internal_label ?? '',
    checks: normalizeInternalChecks(m.attendance_list_internal_checks ?? {}),
    enabled: m.attendance_list_internal_enabled ?? false,
    resultPositive: m.attendance_list_internal_result_positive ?? '',
    resultNegative: m.attendance_list_internal_result_negative ?? '',
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
  const [internalChecks, setInternalChecks] = useState<Record<string, boolean>>({});
  const [internalEnabled, setInternalEnabled] = useState(false);
  const [internalResultPositive, setInternalResultPositive] = useState('');
  const [internalResultNegative, setInternalResultNegative] = useState('');
  const [internalSaving, setInternalSaving] = useState(false);
  const [checklistSaveOk, setChecklistSaveOk] = useState(false);
  const [leaderGuestFirst, setLeaderGuestFirst] = useState('');
  const [leaderGuestLast, setLeaderGuestLast] = useState('');
  const [leaderGuestSaving, setLeaderGuestSaving] = useState(false);
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
        if (!checklistDraftDirtyRef.current) {
          const s = syncInternalStateFromMeeting(d);
          setInternalLabel(s.label);
          setInternalChecks(s.checks);
          setInternalEnabled(s.enabled);
          setInternalResultPositive(s.resultPositive);
          setInternalResultNegative(s.resultNegative);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'));
  };

  const saveInternalChecklist = async () => {
    if (!meetingId) return;
    setInternalSaving(true);
    setChecklistSaveOk(false);
    setError(null);
    try {
      const labelVal = internalLabel.trim() === '' ? null : internalLabel.trim();
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
          internal_checks: internalChecks,
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

  const handleInternalToggleMember = (memberId: string, checked: boolean) => {
    const k = internalCheckKeyMember(memberId);
    setInternalChecks((prev) => ({ ...prev, [k]: checked }));
  };

  const handleInternalToggleGuest = (guestId: string, checked: boolean) => {
    const k = internalCheckKeyGuest(guestId);
    setInternalChecks((prev) => ({ ...prev, [k]: checked }));
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
        const s = syncInternalStateFromMeeting(d);
        setInternalLabel(s.label);
        setInternalChecks(s.checks);
        setInternalEnabled(s.enabled);
        setInternalResultPositive(s.resultPositive);
        setInternalResultNegative(s.resultNegative);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const checklistDirty = useMemo(() => {
    if (!data) return false;
    const m = data.meeting;
    const savedLabel = (m.attendance_list_internal_label ?? '').trim();
    const localLabel = internalLabel.trim();
    const savedPos = (m.attendance_list_internal_result_positive ?? '').trim();
    const localPos = internalResultPositive.trim();
    const savedNeg = (m.attendance_list_internal_result_negative ?? '').trim();
    const localNeg = internalResultNegative.trim();
    const savedChecks = normalizeInternalChecks(m.attendance_list_internal_checks ?? {});
    const memberIds = data.members.map((x) => x.id);
    const guestIds = data.guests.map((x) => x.id);
    return (
      internalEnabled !== (m.attendance_list_internal_enabled ?? false) ||
      localLabel !== savedLabel ||
      localPos !== savedPos ||
      localNeg !== savedNeg ||
      !checksEqualForRows(internalChecks, savedChecks, memberIds, guestIds)
    );
  }, [
    data,
    internalLabel,
    internalChecks,
    internalEnabled,
    internalResultPositive,
    internalResultNegative,
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

  const checklistRowKeys = [
    ...members.map((m) => internalCheckKeyMember(m.id)),
    ...guests.map((g) => internalCheckKeyGuest(g.id)),
  ];
  const internalCheckedCount = checklistRowKeys.filter((k) => internalChecks[k] === true).length;
  const internalUncheckedCount = checklistRowKeys.length - internalCheckedCount;
  const columnTitle = internalLabel.trim() || 'Marcar';
  const summaryTitle = internalLabel.trim() || 'Checklist';
  const posLabel = internalResultPositive.trim() || 'Marcados';
  const negLabel = internalResultNegative.trim() || 'Não marcados';

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
          </p>
        </div>
      </div>

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
        <div className="px-4 py-3 border-b bg-muted/50 space-y-1">
          <h2 className="font-medium">Checklist interno</h2>
          <p className="text-xs text-muted-foreground">
            Opcional. Ative quando quiser marcar itens por pessoa (participantes e visitantes da lista). Personalize
            o nome da lista e dos resultados. Salve para registrar.
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
                  <Label htmlFor="internal-checklist-label">Nome da lista / coluna (ex.: Pagamento)</Label>
                  <Input
                    id="internal-checklist-label"
                    placeholder="Ex.: Pagamento, Material, Contribuição…"
                    value={internalLabel}
                    onChange={(e) => setInternalLabel(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-result-pos">Texto para quem está marcado</Label>
                  <Input
                    id="internal-result-pos"
                    placeholder="Padrão: Marcados"
                    value={internalResultPositive}
                    onChange={(e) => setInternalResultPositive(e.target.value)}
                    disabled={internalSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="internal-result-neg">Texto para quem não está marcado</Label>
                  <Input
                    id="internal-result-neg"
                    placeholder="Padrão: Não marcados"
                    value={internalResultNegative}
                    onChange={(e) => setInternalResultNegative(e.target.value)}
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
                      <th className="text-left p-3 font-medium">Nome</th>
                      <th className="text-center p-3 font-medium w-32">{columnTitle}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="p-3">
                          <span className="font-medium">{m.full_name}</span>
                          <span className="block text-xs text-muted-foreground">Participante</span>
                        </td>
                        <td className="p-3 text-center">
                          <Checkbox
                            checked={internalChecks[internalCheckKeyMember(m.id)] === true}
                            onCheckedChange={(c) => handleInternalToggleMember(m.id, c === true)}
                            disabled={internalSaving}
                            aria-label={`${columnTitle} ${m.full_name}`}
                          />
                        </td>
                      </tr>
                    ))}
                    {guests.map((g) => (
                      <tr key={`g-${g.id}`} className="border-b last:border-0 bg-muted/20">
                        <td className="p-3">
                          <span className="font-medium">{g.full_name}</span>
                          <span className="block text-xs text-muted-foreground">Convidado</span>
                        </td>
                        <td className="p-3 text-center">
                          <Checkbox
                            checked={internalChecks[internalCheckKeyGuest(g.id)] === true}
                            onCheckedChange={(c) => handleInternalToggleGuest(g.id, c === true)}
                            disabled={internalSaving}
                            aria-label={`${columnTitle} ${g.full_name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {members.length === 0 && guests.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">Não há linhas para marcar.</p>
                )}
              </div>

              <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{summaryTitle}</p>
                <p className="text-muted-foreground mt-1">
                  {posLabel}: <span className="font-semibold text-foreground">{internalCheckedCount}</span>
                  {' · '}
                  {negLabel}:{' '}
                  <span className="font-semibold text-foreground">{internalUncheckedCount}</span>
                </p>
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
