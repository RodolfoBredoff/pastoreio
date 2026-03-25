import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader, getMemberByIdAndGroup } from '@/lib/db/queries';
import { query, queryMany, queryOne } from '@/lib/db/postgres';

const MAX_KEY_LEN = 500;
const MAX_VALUE_LEN = 2000;

function normalizeKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > MAX_KEY_LEN) return null;
  return t;
}

function normalizeValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string') return String(raw);
  return raw.length > MAX_VALUE_LEN ? raw.slice(0, MAX_VALUE_LEN) : raw;
}

/**
 * GET /api/member-tags?member_id=uuid
 * Lista tags de um membro do grupo do líder.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('member_id')?.trim();
    if (!memberId) {
      return NextResponse.json({ error: 'member_id é obrigatório' }, { status: 400 });
    }
    const member = await getMemberByIdAndGroup(memberId, leader.group_id);
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const tags = await queryMany<{ id: string; tag_key: string; tag_value: string; updated_at: string }>(
      `SELECT id, tag_key, tag_value, updated_at::text
       FROM member_tags
       WHERE member_id = $1
       ORDER BY tag_key ASC`,
      [memberId]
    );
    return NextResponse.json({ tags });
  } catch (e) {
    console.error('member-tags GET:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PUT /api/member-tags
 * Body: { member_id: string, tag_key: string, tag_value?: string }
 * Cria ou atualiza uma tag (uma chave por membro).
 */
export async function PUT(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    const body = await request.json();
    const memberId = typeof body.member_id === 'string' ? body.member_id.trim() : '';
    const tagKey = normalizeKey(body.tag_key);
    const tagValue = normalizeValue(body.tag_value);
    if (!memberId || !tagKey) {
      return NextResponse.json({ error: 'member_id e tag_key válidos são obrigatórios' }, { status: 400 });
    }
    const member = await getMemberByIdAndGroup(memberId, leader.group_id);
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    const row = await queryOne<{ id: string; tag_key: string; tag_value: string; updated_at: string }>(
      `INSERT INTO member_tags (member_id, tag_key, tag_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (member_id, tag_key)
       DO UPDATE SET tag_value = EXCLUDED.tag_value, updated_at = NOW()
       RETURNING id, tag_key, tag_value, updated_at::text`,
      [memberId, tagKey, tagValue]
    );
    return NextResponse.json({ tag: row });
  } catch (e) {
    console.error('member-tags PUT:', e);
    return NextResponse.json({ error: 'Erro ao salvar tag' }, { status: 500 });
  }
}

/**
 * DELETE /api/member-tags
 * Body: { member_id: string, tag_key: string }
 */
export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }
    const body = await request.json();
    const memberId = typeof body.member_id === 'string' ? body.member_id.trim() : '';
    const tagKey = normalizeKey(body.tag_key);
    if (!memberId || !tagKey) {
      return NextResponse.json({ error: 'member_id e tag_key válidos são obrigatórios' }, { status: 400 });
    }
    const member = await getMemberByIdAndGroup(memberId, leader.group_id);
    if (!member) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 });
    }

    await query(`DELETE FROM member_tags WHERE member_id = $1 AND tag_key = $2`, [memberId, tagKey]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('member-tags DELETE:', e);
    return NextResponse.json({ error: 'Erro ao remover tag' }, { status: 500 });
  }
}
