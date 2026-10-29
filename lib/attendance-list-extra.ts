import { queryMany } from '@/lib/db/postgres';
import type { AttendanceExtraFieldConfig } from '@/lib/attendance-list-rules';

// Regras puras (sem banco) ficam em attendance-list-rules; reexportadas para manter os imports existentes.
export { normalizeExtraValues } from '@/lib/attendance-list-rules';
export type { AttendanceExtraFieldConfig, ExtraValuesEntry } from '@/lib/attendance-list-rules';

/**
 * Campos adicionais obrigatórios da lista de presença.
 * Configuração por encontro (tabela attendance_list_extra_fields):
 *  - label: título exibido (ex.: "O que você vai levar?")
 *  - options: lista de opções (JSONB); NULL = resposta livre (texto)
 *  - allow_custom: quando há opções, permite também digitar resposta própria
 * Respostas ficam em extra_values (JSONB) como [{ field_id, values[] }].
 */

export type ExtraFieldConfigInput = {
  id?: string;
  label: string;
  options: string[] | null;
  allow_custom: boolean;
};

const MAX_EXTRA_FIELDS = 10;
const MAX_LABEL_LENGTH = 120;
const MAX_OPTION_LENGTH = 120;

function normalizeLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_LABEL_LENGTH) : '';
}

function normalizeOptions(raw: unknown): { ok: true; options: string[] | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, options: null };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'As opções do campo adicional devem ser uma lista' };
  }
  const options = raw
    .map((o) => (typeof o === 'string' ? o.trim().slice(0, MAX_OPTION_LENGTH) : ''))
    .filter((o) => o.length > 0);
  if (options.length === 0) return { ok: true, options: null };
  if (options.length > 30) {
    return { ok: false, error: 'Máximo de 30 opções por campo adicional' };
  }
  // Dedup preservando ordem (case-insensitive)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const opt of options) {
    const key = opt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(opt);
  }
  return { ok: true, options: unique };
}

/**
 * Valida e normaliza a configuração enviada pelo admin (criação ou edição).
 * Retorna lista pronta para persistir ou erro amigável.
 */
export function normalizeExtraFieldConfigs(
  raw: unknown
): { ok: false; error: string } | { ok: true; fields: ExtraFieldConfigInput[] } {
  if (raw == null) return { ok: true, fields: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'Campos adicionais devem ser uma lista' };
  }
  if (raw.length > MAX_EXTRA_FIELDS) {
    return { ok: false, error: `Máximo de ${MAX_EXTRA_FIELDS} campos adicionais por lista` };
  }

  const fields: ExtraFieldConfigInput[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') {
      return { ok: false, error: 'Campo adicional inválido' };
    }
    const entry = item as Record<string, unknown>;
    const label = normalizeLabel(entry.label);
    if (!label) {
      return { ok: false, error: 'Informe o título de cada campo adicional' };
    }
    const optionsRes = normalizeOptions(entry.options);
    if (!optionsRes.ok) return optionsRes;
    const idRaw = typeof entry.id === 'string' ? entry.id.trim() : '';
    fields.push({
      ...(idRaw ? { id: idRaw } : {}),
      label,
      options: optionsRes.options,
      allow_custom: entry.allow_custom === undefined ? true : Boolean(entry.allow_custom),
    });
  }
  return { ok: true, fields };
}

type ExtraFieldRow = {
  id: string;
  label: string;
  options: string[] | null;
  allow_custom: boolean;
  position: number;
};

function rowToConfig(row: ExtraFieldRow): AttendanceExtraFieldConfig {
  const options = Array.isArray(row.options)
    ? row.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : null;
  return {
    id: row.id,
    label: row.label,
    options: options && options.length > 0 ? options : null,
    allow_custom: row.allow_custom !== false,
    position: Number(row.position) || 0,
  };
}

/** Busca os campos adicionais configurados para o encontro (ordenados). */
export async function getMeetingExtraFields(meetingId: string): Promise<AttendanceExtraFieldConfig[]> {
  const rows = await queryMany<ExtraFieldRow>(
    `SELECT id, label, options, allow_custom, position
     FROM attendance_list_extra_fields
     WHERE meeting_id = $1
     ORDER BY position ASC, created_at ASC`,
    [meetingId]
  ).catch(() => []);
  return rows.map(rowToConfig);
}

/** Formata os valores de um campo para exibição (tabela interna / CSV). */
export function extraValuesForField(
  extraValues: unknown,
  fieldId: string
): string[] {
  if (!Array.isArray(extraValues)) return [];
  for (const item of extraValues) {
    if (item == null || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    if (entry.field_id === fieldId && Array.isArray(entry.values)) {
      return entry.values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    }
  }
  return [];
}
