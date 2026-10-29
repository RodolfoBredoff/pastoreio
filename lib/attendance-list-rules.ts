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
