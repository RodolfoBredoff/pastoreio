'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calendar, MapPin, CheckCircle2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'prefilled' | 'open';

type PublicPayload = {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
    notes: string | null;
    attendance_list_deadline: string | null;
    attendance_list_mode: Mode;
    invite_cover_image_url?: string | null;
  };
  count_confirmed: number;
  count_guests: number;
  is_expired: boolean;
  public_summary_only: true;
};

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

export default function ListaPresencaPublicPage() {
  const params = useParams();
  const slug = params?.slug as string | undefined;

  const [data, setData] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form (open)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [noEmail, setNoEmail] = useState(false);

  // Form (prefilled)
  const [prefilledPhone, setPrefilledPhone] = useState('');
  const [prefilledEmail, setPrefilledEmail] = useState('');
  const [prefilledNoEmail, setPrefilledNoEmail] = useState(true);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lista-presenca/${slug}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Lista não encontrada');
      setData(json as PublicPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmitOpen = async () => {
    if (!slug || !data) return;
    setSubmitOk(null);
    setSubmitError('');

    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();
    const ph = phone.replace(/\D/g, '');
    const hasEmail = !noEmail && em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
    const hasPhone = noEmail && ph.length >= 10;

    if (!fn) { setSubmitError('Informe o nome.'); return; }
    if (!ln) { setSubmitError('Informe o sobrenome.'); return; }
    if (!hasEmail && !hasPhone) {
      setSubmitError(noEmail ? 'Informe um telefone com DDD (mín. 10 dígitos).' : 'Informe um e-mail válido.');
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await fetch(`/api/lista-presenca/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'open',
          first_name: fn,
          last_name: ln,
          ...(hasEmail ? { email: em } : {}),
          ...(hasPhone ? { phone: ph } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erro ao confirmar');
      setSubmitOk('Confirmação registrada. Obrigado!');
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setNoEmail(false);
      await fetchData();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erro ao confirmar');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSubmitPrefilled = async () => {
    if (!slug || !data) return;
    setSubmitOk(null);
    setSubmitError('');

    const ph = prefilledPhone.replace(/\D/g, '');
    const em = prefilledEmail.trim();
    const hasPhone = prefilledNoEmail && ph.length >= 10;
    const hasEmail = !prefilledNoEmail && em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

    if (!hasPhone && !hasEmail) {
      setSubmitError(prefilledNoEmail ? 'Informe um telefone com DDD (mín. 10 dígitos).' : 'Informe um e-mail válido.');
      return;
    }

    setSubmitLoading(true);
    try {
      const res = await fetch(`/api/lista-presenca/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'prefilled',
          ...(hasPhone ? { phone: ph } : {}),
          ...(hasEmail ? { email: em } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erro ao confirmar');
      setSubmitOk('Presença confirmada. Obrigado!');
      setPrefilledPhone(''); setPrefilledEmail('');
      await fetchData();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Erro ao confirmar');
    } finally {
      setSubmitLoading(false);
    }
  };

  if (!slug) {
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

  const { meeting, count_confirmed, count_guests, is_expired } = data;
  const mapsUrl =
    meeting.location && meeting.location.trim().length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meeting.location.trim())}`
      : null;

  return (
    <div className="min-h-screen bg-muted/30 p-4 pb-8">
      <div className="max-w-lg mx-auto space-y-6">
        {meeting.invite_cover_image_url ? (
          <div className="rounded-xl overflow-hidden border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meeting.invite_cover_image_url}
              alt="Capa do convite"
              className="w-full h-48 object-cover"
            />
          </div>
        ) : null}
        <header className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            {meeting.title || 'Lista de confirmação'}
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
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2"
                  >
                    {meeting.location}
                  </a>
                ) : (
                  meeting.location
                )}
              </span>
            )}
            {meeting.notes && meeting.notes.trim() && (
              <span className="flex items-baseline gap-1.5 w-full justify-center">
                <span className="text-muted-foreground font-medium shrink-0">Informações:</span>
                <span className="text-sm text-muted-foreground">{meeting.notes.trim()}</span>
              </span>
            )}
          </div>
        </header>

        <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-4 justify-center">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{count_confirmed}</span>
            <span className="text-sm text-muted-foreground">confirmados</span>
          </div>
          {count_guests > 0 && (
            <div className="flex items-center gap-2 text-blue-700">
              <UserPlus className="h-5 w-5" />
              <span className="font-medium">{count_guests}</span>
              <span className="text-sm text-muted-foreground">{count_guests === 1 ? 'visitante' : 'visitantes'}</span>
            </div>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground px-2">
          Esta página é pública e exibe apenas totais. Nenhum nome, e-mail ou telefone é mostrado.
        </p>

        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/50 space-y-1">
            <p className="text-sm text-muted-foreground">
              {is_expired
                ? 'O prazo para registrar confirmações por este link foi encerrado.'
                : meeting.attendance_list_mode === 'open'
                  ? 'Confirme sua presença preenchendo nome, sobrenome e e-mail ou telefone.'
                  : 'Confirme sua presença informando seu telefone (ou e-mail).'}
            </p>
          </div>

          {submitOk && (
            <div className="px-4 py-3 text-sm text-green-700 bg-green-50 border-b">
              {submitOk}
            </div>
          )}
          {submitError && (
            <div className="px-4 py-3 text-sm text-destructive bg-destructive/10 border-b">
              {submitError}
            </div>
          )}

          {!is_expired && (
            <div className="p-4 space-y-4">
              {meeting.attendance_list_mode === 'open' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fn">Nome</Label>
                    <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ln">Sobrenome</Label>
                    <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="no-email" checked={noEmail} onCheckedChange={(c) => setNoEmail(c === true)} />
                    <Label htmlFor="no-email" className="text-sm font-normal cursor-pointer">Não quero informar e-mail</Label>
                  </div>
                  {noEmail ? (
                    <div className="space-y-2">
                      <Label htmlFor="ph">Telefone (com DDD)</Label>
                      <Input
                        id="ph"
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitOpen()}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="em">E-mail</Label>
                      <Input
                        id="em"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitOpen()}
                      />
                    </div>
                  )}
                  <Button onClick={handleSubmitOpen} disabled={submitLoading} className={cn('w-full', submitLoading && 'opacity-70')}>
                    {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar presença'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="pref-no-email" checked={prefilledNoEmail} onCheckedChange={(c) => setPrefilledNoEmail(c === true)} />
                    <Label htmlFor="pref-no-email" className="text-sm font-normal cursor-pointer">Quero confirmar por telefone</Label>
                  </div>
                  {prefilledNoEmail ? (
                    <div className="space-y-2">
                      <Label htmlFor="pref-ph">Seu telefone (com DDD)</Label>
                      <Input
                        id="pref-ph"
                        type="tel"
                        placeholder="(11) 99999-9999"
                        value={prefilledPhone}
                        onChange={(e) => setPrefilledPhone(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitPrefilled()}
                      />
                      <p className="text-xs text-muted-foreground">
                        Usamos o telefone para localizar seu cadastro no grupo e registrar a confirmação. O telefone não é exibido publicamente.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="pref-em">Seu e-mail</Label>
                      <Input
                        id="pref-em"
                        type="email"
                        placeholder="seu@email.com"
                        value={prefilledEmail}
                        onChange={(e) => setPrefilledEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitPrefilled()}
                      />
                      <p className="text-xs text-muted-foreground">
                        Se não encontrarmos por e-mail (cadastro do grupo), prefira confirmar por telefone.
                      </p>
                    </div>
                  )}
                  <Button onClick={handleSubmitPrefilled} disabled={submitLoading} className={cn('w-full', submitLoading && 'opacity-70')}>
                    {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar presença'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

