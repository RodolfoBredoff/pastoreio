'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calendar, MapPin, CheckCircle2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AttendanceSource, PublicAttendancePayload } from './attendance-sources';

type PublicPayload = PublicAttendancePayload;

function formatDate(d: string) {
  const date = new Date(d + 'T12:00:00');
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(t: string | null) {
  if (!t) return '';
  const [h, m] = t.split(':');
  return `${h}:${m}`;
}

type ExtraFieldCfg = NonNullable<PublicPayload['extra_fields']>[number];

function ExtraFieldsSection({
  fields,
  selections,
  custom,
  taken,
  onToggleOption,
  onCustomChange,
}: {
  fields: ExtraFieldCfg[];
  selections: Record<string, string[]>;
  custom: Record<string, string>;
  taken: Record<string, Record<string, number>>;
  onToggleOption: (fieldId: string, option: string) => void;
  onCustomChange: (fieldId: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Escolha exatamente 1 item abaixo (qualquer lista) para confirmar presença
      </p>
      {fields.map((f) => {
        const selected = selections[f.id] ?? [];
        const customVal = custom[f.id] ?? '';
        return (
          <div key={f.id} className="space-y-2">
            <Label className="text-sm font-medium">{f.label}</Label>
            {f.options ? (
              <>
                <div className="space-y-1.5">
                  {f.options.map((opt) => {
                    const count = taken?.[f.id]?.[opt] ?? 0;
                    return (
                      <label
                        key={opt}
                        className={cn('flex items-start gap-2 text-sm cursor-pointer', count > 0 && 'opacity-60')}
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={selected.includes(opt)}
                          onCheckedChange={() => onToggleOption(f.id, opt)}
                        />
                        <span>
                          {opt}
                          {count > 0 && (
                            <span className="ml-1 text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                              · já escolhido por {count} {count === 1 ? 'pessoa' : 'pessoas'}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {f.allow_custom && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Outro (especifique)</Label>
                    <Input
                      value={customVal}
                      onChange={(e) => onCustomChange(f.id, e.target.value)}
                      placeholder="Digite sua resposta"
                    />
                  </div>
                )}
              </>
            ) : (
              <Input
                value={customVal}
                onChange={(e) => onCustomChange(f.id, e.target.value)}
                placeholder="Digite sua resposta"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PublicAttendanceView({
  slug,
  source,
}: {
  slug: string | undefined;
  /** Deve ser uma referência estável (constante de módulo). */
  source: AttendanceSource;
}) {

  const [data, setData] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form (open)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [noEmail, setNoEmail] = useState(false);
  const [rg, setRg] = useState('');

  // Form (prefilled)
  const [prefilledPhone, setPrefilledPhone] = useState('');
  const [prefilledEmail, setPrefilledEmail] = useState('');
  const [prefilledNoEmail, setPrefilledNoEmail] = useState(true);

  // Campos adicionais obrigatórios
  const [extraSelections, setExtraSelections] = useState<Record<string, string[]>>({});
  const [extraCustom, setExtraCustom] = useState<Record<string, string>>({});

  const extraFields = data?.extra_fields ?? [];

  const toggleExtraOption = (fieldId: string, option: string) => {
    setExtraSelections((prev) => {
      const cur = prev[fieldId] ?? [];
      if (cur.includes(option)) {
        return { ...prev, [fieldId]: cur.filter((o) => o !== option) };
      }
      // Escolha única: marcar uma opção desmarca todas as outras
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(prev)) next[k] = [];
      next[fieldId] = [option];
      return next;
    });
    // Selecionar uma opção substitui respostas digitadas
    setExtraCustom((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(prev)) next[k] = '';
      return next;
    });
  };
  const setExtraCustomValue = (fieldId: string, value: string) => {
    // Escolha única: digitar uma resposta limpa as outras escolhas
    setExtraCustom((prev) => {
      const next: Record<string, string> = {};
      for (const k of Object.keys(prev)) next[k] = '';
      next[fieldId] = value;
      return next;
    });
    setExtraSelections((prev) => {
      const next: Record<string, string[]> = {};
      for (const k of Object.keys(prev)) next[k] = [];
      return next;
    });
  };
  const resetExtras = () => {
    setExtraSelections({});
    setExtraCustom({});
  };
  const buildExtraValues = (): { ok: false; error: string } | { ok: true; values: Array<{ field_id: string; values: string[] }> } => {
    const answers: Array<{ field_id: string; value: string }> = [];
    for (const f of extraFields) {
      for (const s of extraSelections[f.id] ?? []) {
        if (s.trim()) answers.push({ field_id: f.id, value: s.trim() });
      }
      const customVal = (extraCustom[f.id] ?? '').trim();
      if (customVal) answers.push({ field_id: f.id, value: customVal });
    }
    if (answers.length === 0) {
      return { ok: false, error: 'Escolha um item para confirmar presença.' };
    }
    if (answers.length > 1) {
      return { ok: false, error: 'Selecione apenas um item para confirmar presença.' };
    }
    return { ok: true, values: [{ field_id: answers[0].field_id, values: [answers[0].value] }] };
  };

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      setData(await source.load(slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, [slug, source]);

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
    if (data.meeting.attendance_list_require_rg && !rg.trim()) {
      setSubmitError('Informe o RG.');
      return;
    }

    const extras = buildExtraValues();
    if (!extras.ok) {
      setSubmitError(extras.error);
      return;
    }

    setSubmitLoading(true);
    try {
      await source.submit(slug, {
        mode: 'open',
        first_name: fn,
        last_name: ln,
        ...(hasEmail ? { email: em } : {}),
        ...(hasPhone ? { phone: ph } : {}),
        ...(data.meeting.attendance_list_require_rg ? { rg: rg.trim() } : {}),
        ...(extras.values.length > 0 ? { extra_values: extras.values } : {}),
      });
      setSubmitOk('Confirmação registrada. Obrigado!');
      setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setNoEmail(false); setRg('');
      resetExtras();
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

    const extras = buildExtraValues();
    if (!extras.ok) {
      setSubmitError(extras.error);
      return;
    }

    setSubmitLoading(true);
    try {
      await source.submit(slug, {
        mode: 'prefilled',
        ...(hasPhone ? { phone: ph } : {}),
        ...(hasEmail ? { email: em } : {}),
        ...(extras.values.length > 0 ? { extra_values: extras.values } : {}),
      });
      setSubmitOk('Presença confirmada. Obrigado!');
      setPrefilledPhone(''); setPrefilledEmail('');
      resetExtras();
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

  const { meeting, count_confirmed, count_guests, is_expired, is_limit_reached } = data;
  const hasLimit = meeting.attendance_list_limit != null && meeting.attendance_list_limit > 0;
  const formDisabled = is_expired || is_limit_reached;
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
              className="w-full max-h-80 object-contain rounded-md bg-gray-50"
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
          </div>
          {meeting.notes && meeting.notes.trim() && (
            <div className="mt-3 text-center px-2">
              <p className="text-xs text-muted-foreground font-medium mb-1">Informações:</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{meeting.notes.trim()}</p>
            </div>
          )}
        </header>

        <div className="rounded-lg border bg-card p-4 flex flex-wrap gap-4 justify-center">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              {count_confirmed}
              {hasLimit ? ` / ${meeting.attendance_list_limit}` : ''}
            </span>
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
                : is_limit_reached
                  ? 'O limite de inscrições para este evento já foi atingido.'
                  : meeting.attendance_list_mode === 'open'
                    ? `Confirme sua presença preenchendo nome, sobrenome${meeting.attendance_list_require_rg ? ', RG' : ''} e e-mail ou telefone.`
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

          {!formDisabled && (
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
                  {meeting.attendance_list_require_rg && (
                    <div className="space-y-2">
                      <Label htmlFor="rg">RG</Label>
                      <Input
                        id="rg"
                        placeholder="Ex: 12.345.678-9"
                        value={rg}
                        onChange={(e) => setRg(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmitOpen()}
                      />
                    </div>
                  )}
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
                  <ExtraFieldsSection
                    fields={extraFields}
                    selections={extraSelections}
                    custom={extraCustom}
                    taken={data?.extra_options_taken ?? {}}
                    onToggleOption={toggleExtraOption}
                    onCustomChange={setExtraCustomValue}
                  />
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
                  <ExtraFieldsSection
                    fields={extraFields}
                    selections={extraSelections}
                    custom={extraCustom}
                    taken={data?.extra_options_taken ?? {}}
                    onToggleOption={toggleExtraOption}
                    onCustomChange={setExtraCustomValue}
                  />
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

