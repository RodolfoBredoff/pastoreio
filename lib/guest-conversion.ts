/**
 * Conversão de visitante avulso em membro e o "desfazer".
 *
 * Desfazer só é permitido quando for seguro: se a pessoa já tem vida própria como membro
 * (tags, contatos, discípulos, confirmações de evento, presença em outros encontros, dados
 * alterados), recusamos e explicamos o motivo, em vez de adivinhar e perder dados.
 */
import { transaction, queryOne, queryMany } from '@/lib/db/postgres';
import type { PoolClient } from 'pg';

export interface ConversionRecord {
  id: string;
  group_id: string;
  member_id: string;
  guest_id: string;
  guest_full_name: string;
  guest_phone: string | null;
  guest_description: string | null;
  guest_created_at: string | null;
  meeting_ids: string[];
  converted_at: string;
}

export interface UndoEvaluation {
  /** Existe uma conversão registrada para este membro */
  hasConversion: boolean;
  canUndo: boolean;
  reasons: string[];
  conversion?: Pick<ConversionRecord, 'id' | 'guest_full_name' | 'converted_at'> & { meetings_count: number };
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Registra a conversão (chamar dentro da transação, ANTES de apagar o visitante). */
export async function recordConversion(
  client: PoolClient,
  input: { groupId: string; memberId: string; guestId: string; convertedBy: string | null }
): Promise<string> {
  const guest = await client.query<{
    id: string; full_name: string; phone: string | null; description: string | null; created_at: string;
  }>(`SELECT id, full_name, phone, description, created_at FROM guest_visitors WHERE id = $1`, [input.guestId]);
  const g = guest.rows[0];
  if (!g) throw new Error('Visitante não encontrado para registrar a conversão');

  const photo = await client.query<{ mime_type: string; data: Buffer; consent_at: string }>(
    `SELECT mime_type, data, consent_at FROM guest_visitor_photos WHERE guest_id = $1`,
    [input.guestId]
  );
  const meetings = await client.query<{ meeting_id: string }>(
    `SELECT meeting_id FROM attendance_guests WHERE guest_id = $1`,
    [input.guestId]
  );
  const p = photo.rows[0];
  const ins = await client.query<{ id: string }>(
    `INSERT INTO guest_conversions
       (group_id, member_id, guest_id, guest_full_name, guest_phone, guest_description, guest_created_at,
        guest_photo_mime, guest_photo_data, guest_photo_consent_at, meeting_ids, converted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid[],$12)
     RETURNING id`,
    [
      input.groupId, input.memberId, g.id, g.full_name, g.phone, g.description, g.created_at,
      p?.mime_type ?? null, p?.data ?? null, p?.consent_at ?? null,
      meetings.rows.map((m) => m.meeting_id), input.convertedBy,
    ]
  );
  return ins.rows[0].id;
}

/** Roda as verificações de segurança (sem alterar nada). Usa o client da transação quando houver. */
async function evaluate(
  q: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>,
  memberId: string,
  groupId: string
): Promise<{ evaluation: UndoEvaluation; record?: ConversionRecord }> {
  const rec = (
    await q(
      `SELECT id, group_id, member_id, guest_id, guest_full_name, guest_phone, guest_description,
              guest_created_at::text AS guest_created_at, meeting_ids, converted_at::text AS converted_at
       FROM guest_conversions
       WHERE member_id = $1
       ORDER BY converted_at DESC LIMIT 1`,
      [memberId]
    )
  ).rows[0] as ConversionRecord | undefined;

  if (!rec || rec.group_id !== groupId) {
    return { evaluation: { hasConversion: false, canUndo: false, reasons: [] } };
  }

  const member = (
    await q(
      `SELECT id, full_name, phone, birth_date, member_type, integration_stage, is_active, discipulador_id
       FROM members WHERE id = $1 AND group_id = $2`,
      [memberId, groupId]
    )
  ).rows[0];
  const reasons: string[] = [];
  const meetingIds = rec.meeting_ids ?? [];

  if (!member) {
    reasons.push('A pessoa não existe mais.');
  } else {
    if (!member.is_active) reasons.push('A pessoa foi desativada.');
    if (member.member_type !== 'visitor' || member.integration_stage === 'membro') {
      reasons.push('A pessoa já foi promovida a membro do grupo.');
    }
    if (member.birth_date) reasons.push('A data de nascimento foi preenchida.');
    if (norm(member.full_name) !== norm(rec.guest_full_name) || digits(member.phone) !== digits(rec.guest_phone)) {
      reasons.push('O nome ou o telefone foram editados depois da conversão.');
    }
    if (member.discipulador_id) reasons.push('A pessoa já tem um discipulador definido.');

    const dep = (
      await q(
        `SELECT
           (SELECT COUNT(*) FROM member_tags WHERE member_id = $1)::int AS tags,
           (SELECT COUNT(*) FROM contact_log WHERE member_id = $1)::int AS contacts,
           (SELECT COUNT(*) FROM attendance_list_responses WHERE member_id = $1)::int AS responses,
           (SELECT COUNT(*) FROM members WHERE discipulador_id = $1)::int AS disciples,
           (SELECT COUNT(*) FROM attendance
              WHERE member_id = $1 AND is_present = TRUE AND NOT (meeting_id = ANY($2::uuid[])))::int AS other_presences`,
        [memberId, meetingIds]
      )
    ).rows[0];
    if (dep.tags > 0) reasons.push('A pessoa já tem tags.');
    if (dep.contacts > 0) reasons.push('A pessoa já tem contatos registrados.');
    if (dep.responses > 0) reasons.push('A pessoa já respondeu a uma lista de presença de evento.');
    if (dep.disciples > 0) reasons.push('A pessoa já é discipuladora de alguém.');
    if (dep.other_presences > 0) reasons.push('A pessoa já tem presença em encontros posteriores à conversão.');
  }

  return {
    record: rec,
    evaluation: {
      hasConversion: true,
      canUndo: reasons.length === 0,
      reasons,
      conversion: {
        id: rec.id,
        guest_full_name: rec.guest_full_name,
        converted_at: rec.converted_at,
        meetings_count: meetingIds.length,
      },
    },
  };
}

export async function evaluateUndoConversion(memberId: string, groupId: string): Promise<UndoEvaluation> {
  const q = async (text: string, params?: unknown[]) => ({ rows: await queryMany(text, params) });
  return (await evaluate(q, memberId, groupId)).evaluation;
}

export class UndoConversionError extends Error {
  constructor(message: string, public reasons: string[], public status: number) {
    super(message);
  }
}

/**
 * Desfaz a conversão: recria o visitante (mesmo id, dados e foto), devolve a presença dele
 * aos encontros em que ainda constava como presente e remove o membro criado pela conversão.
 * Tudo em uma transação; se qualquer verificação falhar, nada é alterado.
 */
export async function undoConversion(
  memberId: string,
  groupId: string
): Promise<{ guestId: string; restoredMeetings: number }> {
  return transaction(async (client) => {
    // Trava o membro para ninguém alterá-lo durante a verificação
    await client.query(`SELECT id FROM members WHERE id = $1 FOR UPDATE`, [memberId]);
    const { evaluation, record } = await evaluate((t, p) => client.query(t, p as unknown[]), memberId, groupId);
    if (!evaluation.hasConversion || !record) {
      throw new UndoConversionError('Esta pessoa não tem uma conversão para desfazer.', [], 404);
    }
    if (!evaluation.canUndo) {
      throw new UndoConversionError('Não é possível desfazer a conversão automaticamente.', evaluation.reasons, 409);
    }

    // Visitante de volta, com o mesmo id (se por algum motivo já existir, reaproveita)
    await client.query(
      `INSERT INTO guest_visitors (id, group_id, full_name, phone, description, created_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
       ON CONFLICT (id) DO NOTHING`,
      [record.guest_id, groupId, record.guest_full_name, record.guest_phone, record.guest_description, record.guest_created_at]
    );
    await client.query(
      `INSERT INTO guest_visitor_photos (guest_id, mime_type, data, size_bytes, consent_at)
       SELECT $1, guest_photo_mime, guest_photo_data, octet_length(guest_photo_data), COALESCE(guest_photo_consent_at, NOW())
       FROM guest_conversions WHERE id = $2 AND guest_photo_data IS NOT NULL
       ON CONFLICT (guest_id) DO NOTHING`,
      [record.guest_id, record.id]
    );

    // Presença volta a ser de visitante apenas nos encontros em que o membro continua presente.
    // Se o líder já marcou falta, respeita a correção e não recria a presença.
    const restored = await client.query(
      `INSERT INTO attendance_guests (meeting_id, guest_id)
       SELECT a.meeting_id, $1
       FROM attendance a
       WHERE a.member_id = $2 AND a.is_present = TRUE AND a.meeting_id = ANY($3::uuid[])
       ON CONFLICT (meeting_id, guest_id) DO NOTHING`,
      [record.guest_id, memberId, record.meeting_ids ?? []]
    );

    // Apaga o membro criado pela conversão. O histórico (guest_conversions) some junto, por cascata.
    await client.query(`DELETE FROM members WHERE id = $1 AND group_id = $2`, [memberId, groupId]);
    return { guestId: record.guest_id, restoredMeetings: restored.rowCount ?? 0 };
  });
}

/** Existe conversão registrada para este membro? (sem verificar segurança) */
export async function getActiveConversion(memberId: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    `SELECT id FROM guest_conversions WHERE member_id = $1 LIMIT 1`,
    [memberId]
  );
}
