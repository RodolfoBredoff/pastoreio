'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Calendar, MapPin, CheckCircle2, UserPlus, CreditCard, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AttendanceSource, PublicAttendancePayload } from './attendance-sources';

type PublicPayload = PublicAttendancePayload;

const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Confirmação já validada, aguardando o comprovante (evento pago). */
type PendingRequest = {
  mode: 'open' | 'prefilled';
  /** Dados para identificar a pessoa no endpoint de presign. */
  identity: Record<string, string>;
  /** Corpo da confirmação (sem o id do comprovante). */
  body: Record<string, unknown>;
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

type ExtraFieldCfg = NonNullable<PublicPayload['extra_fields']>[number];

function ExtraFieldsSection({
  fields,
  selections,
  custom,
  taken,
  optional,
  onToggleOption,
  onCustomChange,
}: {
  fields: ExtraFieldCfg[];
  selections: Record<string, string[]>;
  custom: Record<string, string>;
  taken: Record<string, Record<string, number>>;
  /** Evento pago: o item é opcional (sem ele, a pessoa paga via PIX). */
  optional?: boolean;
  onToggleOption: (fieldId: string, option: string) => void;
  onCustomChange: (fieldId: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {optional
          ? 'Opcional: escolha 1 item abaixo para confirmar sem pagamento. Se não escolher, você confirma enviando o comprovante do PIX.'
          : 'Escolha exatamente 1 item abaixo (qualquer lista) para confirmar presença'}
      </p>
      {fields.map((f) => {
        const selected = selections[f.id] ?? [];
        const customVal = custom[f.id] ?? '';
        // Respostas próprias de outras pessoas (fora das opções configuradas)
        const configured = new Set((f.options ?? []).map((o) => o.toLowerCase()));
        const customTaken = Object.entries(taken?.[f.id] ?? {}).filter(
          ([name, n]) => n > 0 && !configured.has(name.toLowerCase())
        );
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
            {customTaken.length > 0 && (
              <div className="rounded-md border border-dashed bg-background/60 p-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Outros itens já escolhidos</p>
                <ul className="space-y-0.5">
                  {customTaken.map(([name, n]) => (
                    <li key={name} className="text-sm">
                      {name}
                      <span className="ml-1 text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        · {n} {n === 1 ? 'pessoa' : 'pessoas'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
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

  // Estados para evento pago
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentReceiptFile, setPaymentReceiptFile] = useState<File | null>(null);
  const [paymentReceiptId, setPaymentReceiptId] = useState<string | null>(null);
  const [paymentUploading, setPaymentUploading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Sem campos adicionais não há item a escolher (mesma regra do servidor)
    if (extraFields.length === 0) return { ok: true, values: [] };
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

  // A pessoa preencheu algum item nos campos adicionais?
  const hasFilledExtraField = (): boolean =>
    extraFields.some(
      (f) => (extraSelections[f.id] ?? []).some((s) => s.trim()) || (extraCustom[f.id] ?? '').trim().length > 0
    );

  // Evento pago: o item é opcional. Sem item (ou sem campos adicionais) a pessoa paga e envia o comprovante.
  const needsPayment = (): boolean => {
    if (!data?.meeting.is_paid_event) return false;
    return extraFields.length === 0 || !hasFilledExtraField();
  };

  /**
   * Valida os campos adicionais conforme o caso:
   *  - precisa pagar -> item é opcional, nada a validar (vai para o modal do PIX);
   *  - caso contrário -> regra de sempre (exatamente 1 item).
   */
  const resolveExtras = (): { ok: false; error: string } | { ok: true; values: Array<{ field_id: string; values: string[] }> } => {
    if (needsPayment()) return { ok: true, values: [] };
    return buildExtraValues();
  };

  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitOk, setSubmitOk] = useState<string | null>(null);

  // Dados validados da pessoa, guardados enquanto o modal de pagamento está aberto
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);

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

  /** Valida o formulário "lista vazia". */
  const buildOpenRequest = (): { error: string } | { request: PendingRequest } => {
    if (!data) return { error: 'Lista indisponível.' };
    const fn = firstName.trim();
    const ln = lastName.trim();
    const em = email.trim();
    const ph = phone.replace(/\D/g, '');
    const hasEmail = !noEmail && em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
    const hasPhone = noEmail && ph.length >= 10;

    if (!fn) return { error: 'Informe o nome.' };
    if (!ln) return { error: 'Informe o sobrenome.' };
    if (!hasEmail && !hasPhone) {
      return { error: noEmail ? 'Informe um telefone com DDD (mín. 10 dígitos).' : 'Informe um e-mail válido.' };
    }
    if (data.meeting.attendance_list_require_rg && !rg.trim()) return { error: 'Informe o RG.' };

    const extras = resolveExtras();
    if (!extras.ok) return { error: extras.error };

    return {
      request: {
        mode: 'open',
        identity: {
          mode: 'open',
          first_name: fn,
          last_name: ln,
          ...(hasEmail ? { email: em } : {}),
          ...(hasPhone ? { phone: ph } : {}),
        },
        body: {
          mode: 'open',
          first_name: fn,
          last_name: ln,
          ...(hasEmail ? { email: em } : {}),
          ...(hasPhone ? { phone: ph } : {}),
          ...(data.meeting.attendance_list_require_rg ? { rg: rg.trim() } : {}),
          ...(extras.values.length > 0 ? { extra_values: extras.values } : {}),
        },
      },
    };
  };

  /** Valida o formulário "pré-preenchida" (membro identificado pelo telefone). */
  const buildPrefilledRequest = (): { error: string } | { request: PendingRequest } => {
    const ph = prefilledPhone.replace(/\D/g, '');
    const em = prefilledEmail.trim();
    const hasPhone = prefilledNoEmail && ph.length >= 10;
    const hasEmail = !prefilledNoEmail && em && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

    if (!hasPhone && !hasEmail) {
      return { error: prefilledNoEmail ? 'Informe um telefone com DDD (mín. 10 dígitos).' : 'Informe um e-mail válido.' };
    }

    const extras = resolveExtras();
    if (!extras.ok) return { error: extras.error };

    // O comprovante é vinculado ao cadastro do membro, que é localizado pelo telefone.
    if (needsPayment() && !hasPhone) {
      return { error: 'Para enviar o comprovante, confirme usando o seu telefone (com DDD).' };
    }

    return {
      request: {
        mode: 'prefilled',
        identity: { mode: 'prefilled', ...(hasPhone ? { phone: ph } : {}) },
        body: {
          mode: 'prefilled',
          ...(hasPhone ? { phone: ph } : {}),
          ...(hasEmail ? { email: em } : {}),
          ...(extras.values.length > 0 ? { extra_values: extras.values } : {}),
        },
      },
    };
  };

  /** Envia a confirmação. Retorna a mensagem de erro, ou null se deu certo. */
  const sendConfirmation = async (request: PendingRequest, receiptId: string | null): Promise<string | null> => {
    if (!slug) return 'Link inválido.';
    setSubmitLoading(true);
    try {
      await source.submit(slug, {
        ...request.body,
        ...(receiptId ? { payment_receipt_id: receiptId } : {}),
      });
      setSubmitOk(request.mode === 'open' ? 'Confirmação registrada. Obrigado!' : 'Presença confirmada. Obrigado!');
      if (request.mode === 'open') {
        setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setNoEmail(false); setRg('');
      } else {
        setPrefilledPhone(''); setPrefilledEmail('');
      }
      resetExtras();
      setPaymentReceiptId(null);
      setPendingRequest(null);
      await fetchData();
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro ao confirmar';
      // Comprovante recusado pelo servidor: força um novo envio
      if (receiptId && /comprovante/i.test(message)) setPaymentReceiptId(null);
      return message;
    } finally {
      setSubmitLoading(false);
    }
  };

  /** Clique em "Confirmar presença" (nos dois modos). */
  const handleConfirm = async (mode: 'open' | 'prefilled') => {
    if (!slug || !data) return;
    setSubmitOk(null);
    setSubmitError('');

    const built = mode === 'open' ? buildOpenRequest() : buildPrefilledRequest();
    if ('error' in built) {
      setSubmitError(built.error);
      return;
    }

    // Evento pago sem item preenchido: abre o modal do PIX; a confirmação acontece após o upload
    if (needsPayment() && !paymentReceiptId) {
      setPendingRequest(built.request);
      setPaymentError('');
      setPaymentReceiptFile(null);
      setShowPaymentModal(true);
      return;
    }

    const failure = await sendConfirmation(built.request, needsPayment() ? paymentReceiptId : null);
    if (failure) setSubmitError(failure);
  };

  const handleSubmitOpen = () => handleConfirm('open');
  const handleSubmitPrefilled = () => handleConfirm('prefilled');

  const closePaymentModal = () => {
    if (paymentUploading) return;
    setShowPaymentModal(false);
    setPaymentReceiptFile(null);
    setPaymentError('');
  };

  const handlePaymentFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo novamente
    if (!file) return;
    if (!RECEIPT_TYPES.includes(file.type)) {
      setPaymentReceiptFile(null);
      setPaymentError('Formato não suportado. Use JPG, PNG, WEBP ou PDF.');
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setPaymentReceiptFile(null);
      setPaymentError('Arquivo muito grande. Máximo 10MB.');
      return;
    }
    setPaymentReceiptFile(file);
    setPaymentError('');
  };

  /** Envia o comprovante (URL pré-assinada -> S3) e, em seguida, conclui a confirmação. */
  const handleUploadAndConfirm = async () => {
    if (!paymentReceiptFile || !slug || !pendingRequest) return;
    setPaymentUploading(true);
    setPaymentError('');

    let receiptId: string;
    try {
      let presignRes: Response;
      try {
        presignRes = await fetch(`/api/lista-presenca/${slug}/payment-presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...pendingRequest.identity,
            contentType: paymentReceiptFile.type,
            size: paymentReceiptFile.size,
          }),
        });
      } catch {
        throw new Error('O envio de comprovante está indisponível no momento. Tente novamente mais tarde.');
      }
      const presign = (await presignRes.json().catch(() => ({}))) as { uploadUrl?: string; receiptId?: string; error?: string };
      if (!presignRes.ok || !presign.uploadUrl || !presign.receiptId) {
        throw new Error(presign.error || 'Não foi possível preparar o envio do comprovante.');
      }

      let putRes: Response;
      try {
        putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': paymentReceiptFile.type },
          body: paymentReceiptFile,
        });
      } catch {
        throw new Error('Falha de conexão ao enviar o comprovante. Tente novamente.');
      }
      if (!putRes.ok) throw new Error('Não foi possível enviar o comprovante. Tente novamente.');

      receiptId = presign.receiptId;
      setPaymentReceiptId(receiptId);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Erro ao enviar comprovante');
      setPaymentUploading(false);
      return;
    }

    // Upload concluído: confirma a presença
    const failure = await sendConfirmation(pendingRequest, receiptId);
    setPaymentUploading(false);
    setShowPaymentModal(false);
    setPaymentReceiptFile(null);
    if (failure) setSubmitError(failure);
  };

  const copyPixKey = async () => {
    const key = data?.meeting.payment_pix_key;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    } catch {
      /* sem permissão de área de transferência: a chave continua visível */
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
        
        {/* Aviso de evento pago */}
        {meeting.is_paid_event && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-amber-900">Este evento é pago</p>
              <p className="text-xs text-amber-800">
                Ao confirmar, você verá a chave PIX e enviará o comprovante de pagamento.
              </p>
              {extraFields.length > 0 && (
                <p className="text-xs text-amber-700">
                  Se preferir contribuir com um item da lista abaixo, escolha-o e confirme sem enviar comprovante.
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground px-2">
          Esta página é pública e exibe apenas totais. Nenhum nome, e-mail ou telefone é mostrado.
        </p>

        {/* Modal de pagamento (PIX + comprovante) */}
        {showPaymentModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-modal-title"
          >
            <div className="bg-card rounded-lg max-w-md w-full p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                  <h3 id="payment-modal-title" className="font-semibold">Pagamento via PIX</h3>
                </div>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={closePaymentModal}
                  disabled={paymentUploading}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Para confirmar sua presença, faça o pagamento via PIX para a chave abaixo e envie o comprovante.
                  A confirmação é concluída assim que o comprovante for enviado.
                </p>

                <div className="bg-muted p-3 rounded border space-y-2">
                  <p className="text-xs text-muted-foreground">Chave PIX</p>
                  <p className="font-mono font-medium break-all">{data?.meeting.payment_pix_key}</p>
                  <Button type="button" variant="outline" size="sm" onClick={copyPixKey}>
                    {pixCopied ? 'Chave copiada!' : 'Copiar chave'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Comprovante de pagamento</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handlePaymentFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={paymentUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{paymentReceiptFile ? paymentReceiptFile.name : 'Selecionar comprovante'}</span>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, WEBP ou PDF (até 10MB).
                  </p>
                </div>

                {paymentError && (
                  <p className="text-sm text-destructive" role="alert">{paymentError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    disabled={paymentUploading}
                    onClick={closePaymentModal}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!paymentReceiptFile || paymentUploading}
                    onClick={handleUploadAndConfirm}
                  >
                    {paymentUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      'Enviar e confirmar'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                    optional={meeting.is_paid_event}
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
                    optional={meeting.is_paid_event}
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

