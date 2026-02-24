'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, UserPlus } from 'lucide-react';

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
          <p className="text-xs text-muted-foreground">Resposta e contato (e-mail ou telefone) de quem confirmou.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">Resposta</th>
                <th className="text-left p-3 font-medium">E-mail / Telefone</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
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
                </tr>
              ))}
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
            <p className="text-xs text-muted-foreground">Cadastrado por (e-mail ou telefone).</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Visitante</th>
                  <th className="text-left p-3 font-medium">Cadastrado por</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-b last:border-0">
                    <td className="p-3">{g.full_name}</td>
                    <td className="p-3 font-mono text-xs">{guestRegisteredBy(g)}</td>
                  </tr>
                ))}
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
