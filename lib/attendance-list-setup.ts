import { randomUUID } from 'crypto';
import { queryOne } from '@/lib/db/postgres';

/**
 * Configuração da lista de presença feita pelo líder (criação e edição).
 * Regra de ouro da edição: mudar a configuração NUNCA altera, edita nem apaga
 * confirmações já registradas (attendance_list_responses / _public_entries / _guests).
 */

const MAX_PIX_KEY_LENGTH = 140;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Token e slug públicos da lista (mesmo formato usado na criação do encontro). */
export function generateListIdentifiers(args: {
  title?: string | null;
  meetingDate: string;
  preferredSlugBase?: string | null;
}): { token: string; slug: string } {
  const provided = typeof args.preferredSlugBase === 'string' ? args.preferredSlugBase.trim() : '';
  const baseTitle = args.title && String(args.title).trim() ? String(args.title).trim() : 'encontro';
  const base = provided ? slugify(provided) : slugify(baseTitle);
  const datePart = args.meetingDate.replaceAll('-', '');
  const candidateBase = `${base || 'encontro'}-${datePart}`.slice(0, 60);
  const slug = `${candidateBase}-${shortId()}`.replace(/-+/g, '-');
  return { token: randomUUID(), slug };
}

/** Valida a configuração de evento pago. Chave PIX é obrigatória quando o evento é pago. */
export function normalizePaidConfig(
  isPaid: unknown,
  pixKey: unknown
): { ok: true; isPaid: boolean; pixKey: string | null } | { ok: false; error: string } {
  if (!isPaid) return { ok: true, isPaid: false, pixKey: null };
  const key = typeof pixKey === 'string' ? pixKey.trim() : '';
  if (!key) return { ok: false, error: 'A chave PIX é obrigatória para eventos pagos' };
  if (key.length > MAX_PIX_KEY_LENGTH) {
    return { ok: false, error: `A chave PIX deve ter no máximo ${MAX_PIX_KEY_LENGTH} caracteres` };
  }
  return { ok: true, isPaid: true, pixKey: key };
}

/** Total de confirmações já registradas (qualquer modo, qualquer status). */
export async function countRecordedConfirmations(meetingId: string): Promise<number> {
  const row = await queryOne<{ c: string }>(
    `SELECT (
       (SELECT COUNT(*) FROM attendance_list_public_entries WHERE meeting_id = $1) +
       (SELECT COUNT(*) FROM attendance_list_responses WHERE meeting_id = $1) +
       (SELECT COUNT(*) FROM attendance_list_guests WHERE meeting_id = $1)
     )::text AS c`,
    [meetingId]
  ).catch(() => null);
  return parseInt(row?.c ?? '0', 10);
}

/** True se algum campo adicional já tem resposta registrada (não pode ser removido). */
export async function extraFieldHasAnswers(meetingId: string, fieldId: string): Promise<boolean> {
  const row = await queryOne<{ used: boolean }>(
    `SELECT (
       EXISTS (SELECT 1 FROM attendance_list_responses
               WHERE meeting_id = $1 AND extra_values @> jsonb_build_array(jsonb_build_object('field_id', $2::text)))
       OR EXISTS (SELECT 1 FROM attendance_list_public_entries
                  WHERE meeting_id = $1 AND extra_values @> jsonb_build_array(jsonb_build_object('field_id', $2::text)))
       OR EXISTS (SELECT 1 FROM attendance_list_guests
                  WHERE meeting_id = $1 AND extra_values @> jsonb_build_array(jsonb_build_object('field_id', $2::text)))
     ) AS used`,
    [meetingId, fieldId]
  ).catch(() => null);
  return row?.used === true;
}
