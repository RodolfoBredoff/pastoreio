import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';
import {
  buildMemberTagMap,
  filterMemberIdsByTagFiltersWithMode,
  parseTagFiltersJson,
  concatenateTagValues,
  TAG_BUCKET_SEM_TAG,
} from '@/lib/member-tags-filter';

/**
 * GET /api/member-tags/members?keys=a,b&filters={}&tag_key=X&bucket=Y
 * Membros ativos do grupo que passam pelos filtros de tag e caem no bucket da chave `tag_key`:
 * - bucket = "(sem tag)" → não possuem essa chave
 * - caso contrário → valor exato da tag (string vazia permitida)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();
    if (!leader?.group_id) {
      return NextResponse.json({ error: 'Líder não vinculado a um grupo' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const keysRaw = searchParams.get('keys')?.trim();
    const tagKey = searchParams.get('tag_key')?.trim();
    const bucket = searchParams.get('bucket');
    if (!keysRaw || !tagKey || bucket === null) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: keys, tag_key, bucket' },
        { status: 400 }
      );
    }

    const chartKeys = [...new Set(keysRaw.split(',').map((k) => k.trim()).filter(Boolean))].slice(0, 10);
    if (chartKeys.length === 0 || !chartKeys.includes(tagKey)) {
      return NextResponse.json(
        { error: 'tag_key deve estar incluída em keys' },
        { status: 400 }
      );
    }

    const filters = parseTagFiltersJson(searchParams.get('filters'));
    if (filters === null) {
      return NextResponse.json({ error: 'filters deve ser um objeto JSON válido' }, { status: 400 });
    }

    const mode = (searchParams.get('mode')?.toUpperCase() === 'OR' ? 'OR' : 'AND') as 'AND' | 'OR';

    const memberRows = await queryMany<{ id: string; full_name: string; phone: string | null; member_type: string }>(
      `SELECT id, full_name, phone, member_type::text
       FROM members
       WHERE group_id = $1 AND is_active = TRUE
       ORDER BY full_name ASC`,
      [leader.group_id]
    );
    const allMemberIds = memberRows.map((r) => r.id);
    if (allMemberIds.length === 0) {
      return NextResponse.json({ members: [] });
    }

    const filterKeys = Object.keys(filters).filter((k) => filters[k]?.length > 0);
    const keysToLoad = [...new Set([...chartKeys, ...filterKeys])];
    const tagRows = await queryMany<{ member_id: string; tag_key: string; tag_value: string }>(
      `SELECT member_id, tag_key, tag_value
       FROM member_tags
       WHERE member_id = ANY($1::uuid[])
         AND tag_key = ANY($2::text[])`,
      [allMemberIds, keysToLoad]
    );

    const byMember = buildMemberTagMap(tagRows);
    const filteredIds = new Set(filterMemberIdsByTagFiltersWithMode(allMemberIds, byMember, filters, mode));

    const inBucket = (memberId: string): boolean => {
      if (!filteredIds.has(memberId)) return false;
      const tags = byMember.get(memberId);
      const values = tags?.get(tagKey);
      if (bucket === TAG_BUCKET_SEM_TAG) {
        return !values || values.length === 0;
      }
      // For multiple values, the bucket is the concatenated string
      if (values && values.length > 0) {
        const concatenated = concatenateTagValues(values);
        return concatenated === bucket;
      }
      return false;
    };

    const members = memberRows.filter((m) => inBucket(m.id));
    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        phone: m.phone,
        member_type: m.member_type,
      })),
    });
  } catch (e) {
    console.error('member-tags/members:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
