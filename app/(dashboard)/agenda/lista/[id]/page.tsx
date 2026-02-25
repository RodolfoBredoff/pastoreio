'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, UserPlus, RotateCcw } from 'lucide-react';

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
}

interface ListData {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
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
  if (g.registered_by_email) return g.registered_by_email;
  if (g.registered_by_phone) return formatPhone(g.registered_by_phone);
  return '—';
}

export default function ListaConfirmacaoPage() {
  const params = useParams();
  const meetingId = params?.id as string | undefined;

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchList = () => {
    if (!meetingId) return;
    fetch(`/api/meetings/${meetingId}/attendance-list`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => Promise.reject(new Error(d.error || 'Erro ao carregar')));
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'));
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
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [meetingId]);

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

      {guests.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50">
            <h2 className="font-medium flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Visitantes cadastrados
            </h2>
            <p className="text-xs text-muted-foreground">Cadastrado por (e-mail ou telefone). Use Resetar para remover o visitante da lista.</p>
          </div>
          <div className="overflow-x-auto">
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
                          {guestBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" /> Resetar</>}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button variant="outline" asChild>
        <Link href="/agenda">Voltar à Agenda</Link>
      </Button>
    </div>
  );
}
