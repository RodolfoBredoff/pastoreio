'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CheckCircle2, XCircle, Loader2, Calendar, MapPin, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MemberItem {
  id: string;
  full_name: string;
  response: { status: 'present' | 'absent'; email: string } | null;
}

interface GuestItem {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  registered_by_email: string;
}

interface ListData {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
  };
  members: MemberItem[];
  guests: GuestItem[];
  count_present: number;
  count_absent: number;
  count_guests: number;
}

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

export default function ListaPresencaPage() {
  const params = useParams();
  const token = params?.token as string | undefined;

  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailModal, setEmailModal] = useState<{ memberId: string; memberName: string; status: 'present' | 'absent' } | null>(null);
  const [email, setEmail] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lista-presenca/${token}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Lista não encontrada');
      }
      const json: ListData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChoose = (memberId: string, memberName: string, status: 'present' | 'absent') => {
    setEmailModal({ memberId, memberName, status });
    setEmail('');
    setSubmitError('');
  };

  const handleSubmitResponse = async () => {
    if (!emailModal || !token) return;
    const emailTrim = email.trim();
    if (!emailTrim) {
      setSubmitError('Informe seu e-mail.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setSubmitError('E-mail inválido.');
      return;
    }
    setSubmitLoading(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/lista-presenca/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: emailModal.memberId,
          status: emailModal.status,
          email: emailTrim,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao registrar');
      setEmailModal(null);
      fetchData();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erro ao registrar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddGuest = async () => {
    const fn = guestFirstName.trim();
    const ln = guestLastName.trim();
    const em = guestEmail.trim();
    if (!fn) { setGuestError('Informe o nome do visitante.'); return; }
    if (!ln) { setGuestError('Informe o sobrenome do visitante.'); return; }
    if (!em) { setGuestError('Informe seu e-mail (quem está cadastrando).'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setGuestError('E-mail inválido.'); return; }
    setGuestError('');
    setGuestLoading(true);
    try {
      const res = await fetch(`/api/lista-presenca/${token}/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: fn, last_name: ln, email: em }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao cadastrar');
      setGuestModalOpen(false);
      setGuestFirstName('');
      setGuestLastName('');
      setGuestEmail('');
      fetchData();
    } catch (e) {
      setGuestError(e instanceof Error ? e.message : 'Erro ao cadastrar');
    } finally {
      setGuestLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <p className="text-destructive">Link inválido.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <p className="text-destructive">{error || 'Lista não encontrada.'}</p>
      </div>
    );
  }

  const { meeting, members, guests = [], count_present, count_absent, count_guests = 0 } = data;

  return (
    <div className="min-h-screen bg-muted/30 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            {meeting.title || 'Lista de presença'}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(meeting.meeting_date)}
              {meeting.meeting_time && ` às ${formatTime(meeting.meeting_time)}`}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {meeting.location}
              </span>
            )}
          </div>
        </header>

        <div className="flex flex-wrap gap-4 justify-center rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{count_present}</span>
            <span className="text-sm text-muted-foreground">presentes</span>
          </div>
          {count_guests > 0 && (
            <div className="flex items-center gap-2 text-blue-700">
              <UserPlus className="h-5 w-5" />
              <span className="font-medium">{count_guests}</span>
              <span className="text-sm text-muted-foreground">{count_guests === 1 ? 'visitante' : 'visitantes'}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-amber-700">
            <XCircle className="h-5 w-5" />
            <span className="font-medium">{count_absent}</span>
            <span className="text-sm text-muted-foreground">ausências</span>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50">
            <p className="text-sm text-muted-foreground">
              Selecione sua opção e informe seu e-mail para registrar.
            </p>
          </div>
          <ul className="divide-y">
            {members.map((member) => (
              <li key={member.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="font-medium text-foreground">{member.full_name}</span>
                <div className="flex gap-2 flex-shrink-0">
                  {member.response ? (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                        member.response.status === 'present'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                      )}
                    >
                      {member.response.status === 'present' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Estarei presente
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" />
                          Vou me ausentar
                        </>
                      )}
                    </span>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => handleChoose(member.id, member.full_name, 'present')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Estarei presente
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-amber-700 border-amber-300 hover:bg-amber-50"
                        onClick={() => handleChoose(member.id, member.full_name, 'absent')}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Vou me ausentar
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Vai levar alguém que ainda não está na lista? Cadastre o visitante abaixo.
            </p>
            <Button variant="outline" size="sm" onClick={() => { setGuestModalOpen(true); setGuestError(''); }}>
              <UserPlus className="h-4 w-4 mr-2" />
              Vou levar um visitante
            </Button>
          </div>
          {guests.length > 0 ? (
            <ul className="divide-y">
              {guests.map((g) => (
                <li key={g.id} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm">
                  <span className="font-medium">{g.full_name}</span>
                  <span className="text-muted-foreground text-xs">Cadastrado por: {g.registered_by_email}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum visitante cadastrado ainda.</p>
          )}
        </div>
      </div>

      <Dialog open={guestModalOpen} onOpenChange={(open) => { setGuestModalOpen(open); if (!open) setGuestError(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vou levar um visitante</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe o nome e sobrenome do visitante e seu e-mail (de quem está cadastrando).
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="guest-first">Nome do visitante</Label>
              <Input
                id="guest-first"
                placeholder="Nome"
                value={guestFirstName}
                onChange={(e) => setGuestFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-last">Sobrenome do visitante</Label>
              <Input
                id="guest-last"
                placeholder="Sobrenome"
                value={guestLastName}
                onChange={(e) => setGuestLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-email">Seu e-mail (quem está cadastrando)</Label>
              <Input
                id="guest-email"
                type="email"
                placeholder="seu@email.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGuest()}
              />
            </div>
          </div>
          {guestError && <p className="text-sm text-destructive">{guestError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestModalOpen(false)} disabled={guestLoading}>
              Cancelar
            </Button>
            <Button onClick={handleAddGuest} disabled={guestLoading}>
              {guestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar visitante'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!emailModal} onOpenChange={(open) => !open && setEmailModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {emailModal?.status === 'present' ? 'Estarei presente' : 'Vou me ausentar'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirme seu e-mail para registrar a resposta de <strong>{emailModal?.memberName}</strong>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="email-list">Seu e-mail</Label>
            <Input
              id="email-list"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitResponse()}
            />
          </div>
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModal(null)} disabled={submitLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitResponse} disabled={submitLoading}>
              {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
