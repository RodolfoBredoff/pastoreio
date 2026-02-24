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
import { CheckCircle2, XCircle, Loader2, Calendar, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MemberItem {
  id: string;
  full_name: string;
  response: { status: 'present' | 'absent'; email: string } | null;
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
  count_present: number;
  count_absent: number;
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

  const { meeting, members, count_present, count_absent } = data;

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

        <div className="flex gap-4 justify-center rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{count_present}</span>
            <span className="text-sm text-muted-foreground">presentes</span>
          </div>
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
      </div>

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
