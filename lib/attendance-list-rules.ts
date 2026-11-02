/**
 * Regras puras da lista de presença pública (sem banco, sem Next).
 * Usadas pelo app (lib/attendance-list-public, lib/attendance-list-extra)
 * e pela Lambda de confirmação offline (aws/terraform-lista-presenca/lambda).
 */

export type AttendanceExtraFieldConfig = {
  id: string;
  label: string;
  options: string[] | null;
  allow_custom: boolean;
  position: number;
};

export type ExtraValuesEntry = { field_id: string; values: string[] };

const MAX_VALUE_LENGTH = 200;

export function normalizeRg(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidRg(value: string): boolean {
  const normalized = normalizeRg(value);
  return normalized.length >= 4 && normalized.length <= 20;
}

export function isAttendanceLimitReached(count: number, limit: number | null | undefined): boolean {
  return limit != null && limit > 0 && count >= limit;
}

export function isMeetingExpired(deadline: string | null): boolean {
  return (
    deadline !== null &&
    !Number.isNaN(new Date(deadline).getTime()) &&
    new Date() > new Date(deadline)
  );
}

/**
 * Valida as respostas dos campos adicionais.
 * Regra (escolha única global): em todo o convite a pessoa fornece EXATAMENTE
 * UM item — uma opção marcada (ou texto próprio) em um único campo, ou o texto
 * de um campo livre. Não pode ficar vazio nem selecionar mais de um.
 */
export function normalizeExtraValues(
  fields: AttendanceExtraFieldConfig[],
  raw: unknown
): { ok: false; error: string } | { ok: true; values: ExtraValuesEntry[] } {
  if (fields.length === 0) return { ok: true, values: [] };

  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Escolha um item para confirmar presença.' };
  }

  const byId = new Map(fields.map((f) => [f.id, f]));
  const answers: Array<{ field: AttendanceExtraFieldConfig; value: string }> = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.field_id !== 'string' || !Array.isArray(e.values)) continue;
    const field = byId.get(e.field_id);
    if (!field) {
      return { ok: false, error: 'Campo adicional inválido' };
    }
    for (const v of e.values) {
      if (typeof v !== 'string') continue;
      const trimmed = v.trim().slice(0, MAX_VALUE_LENGTH);
      if (!trimmed) continue;
      answers.push({ field, value: trimmed });
    }
  }

  if (answers.length === 0) {
    return { ok: false, error: 'Escolha um item para confirmar presença.' };
  }
  if (answers.length > 1) {
    return { ok: false, error: 'Selecione apenas um item para confirmar presença.' };
  }

  const { field, value } = answers[0];
  if (field.options) {
    const allowed = new Set(field.options.map((o) => o.toLowerCase()));
    if (!allowed.has(value.toLowerCase()) && !field.allow_custom) {
      return { ok: false, error: `Escolha uma opção válida em: ${field.label}` };
    }
  }

  return { ok: true, values: [{ field_id: field.id, values: [value] }] };
}

/** True se `raw` traz ao menos uma resposta não vazia em algum campo adicional. */
export function hasAnyExtraAnswer(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const values = (item as Record<string, unknown>).values;
    return Array.isArray(values) && values.some((v) => typeof v === 'string' && v.trim().length > 0);
  });
}

export const PAYMENT_REQUIRED_MESSAGE =
  'Este evento requer pagamento. Envie o comprovante para confirmar a presença.';

/**
 * Regra de confirmação combinando campos adicionais e evento pago:
 *  - Evento não pago: regra de sempre (normalizeExtraValues; item obrigatório).
 *  - Evento pago com campos adicionais:
 *      * preencheu um item -> confirma normalmente (valida o item; comprovante opcional);
 *      * não preencheu nada -> o item é opcional; só confirma com comprovante.
 *  - Evento pago sem campos adicionais: sempre exige comprovante.
 * Outros erros de validação (dois itens, opção inválida) são sempre devolvidos.
 */
export function resolveExtraAndPayment(args: {
  fields: AttendanceExtraFieldConfig[];
  rawExtraValues: unknown;
  isPaidEvent: boolean;
  hasReceipt: boolean;
}):
  | { ok: false; error: string; code: 'invalid_extra' | 'payment_required' }
  | { ok: true; values: ExtraValuesEntry[]; requiresReceipt: boolean } {
  const { fields, rawExtraValues, isPaidEvent, hasReceipt } = args;

  let values: ExtraValuesEntry[] = [];
  let requiresReceipt = false;

  if (fields.length === 0) {
    requiresReceipt = isPaidEvent;
  } else if (isPaidEvent && !hasAnyExtraAnswer(rawExtraValues)) {
    requiresReceipt = true;
  } else {
    const res = normalizeExtraValues(fields, rawExtraValues);
    if (!res.ok) return { ok: false, error: res.error, code: 'invalid_extra' };
    values = res.values;
  }

  if (requiresReceipt && !hasReceipt) {
    return { ok: false, error: PAYMENT_REQUIRED_MESSAGE, code: 'payment_required' };
  }
  return { ok: true, values, requiresReceipt };
}

/**
 * Conta as respostas dos campos adicionais (apenas totais, sem dados pessoais).
 * Opções configuradas usam o nome da configuração; respostas próprias (campo livre
 * ou "outro") são agrupadas sem diferenciar maiúsculas/minúsculas, mantendo a
 * primeira grafia vista.
 */
export function countExtraAnswers(
  fields: AttendanceExtraFieldConfig[],
  rows: Array<{ extra_values: unknown }>
): Record<string, Record<string, number>> {
  const taken: Record<string, Record<string, number>> = {};
  const canonicalByField = new Map<string, Map<string, string>>();
  for (const f of fields) {
    taken[f.id] = {};
    const canonical = new Map<string, string>();
    for (const o of f.options ?? []) canonical.set(o.toLowerCase(), o);
    canonicalByField.set(f.id, canonical);
  }

  for (const row of rows) {
    const entries = Array.isArray(row.extra_values) ? row.extra_values : [];
    for (const item of entries) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Record<string, unknown>;
      if (typeof e.field_id !== 'string' || !Array.isArray(e.values)) continue;
      const canonical = canonicalByField.get(e.field_id);
      if (!canonical) continue;
      for (const v of e.values) {
        if (typeof v !== 'string') continue;
        const trimmed = v.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (!canonical.has(key)) canonical.set(key, trimmed);
        const name = canonical.get(key)!;
        taken[e.field_id][name] = (taken[e.field_id][name] ?? 0) + 1;
      }
    }
  }
  return taken;
}
