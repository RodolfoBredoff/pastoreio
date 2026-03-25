import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

type FiltersPayload = Record<string, string[]>;

function parseFiltersJson(raw: string | null): FiltersPayload | null {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: FiltersPayload = {};
    for (const [k, val] of Object.entries(v)) {
      const key = k.trim();
      if (!key) continue;
      if (!Array.isArray(val)) continue;
      const strings = val.filter((x): x is string => typeof x === 'string').map((s) => s);
      if (strings.length > 0) out[key] = strings;
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * GET /api/member-tags/analytics?keys=a,b,c&filters={"chave":["v1"]}
 * Para cada chave em `keys`, histograma de valores entre membros ativos do grupo
 * que satisfazem todos os filtros (AND por chave: valor da tag deve estar na lista).
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
    if (!keysRaw) {
      return NextResponse.json({
        memberCount: 0,
        distributions: [] as { tagKey: string; buckets: { value: string; count: number }[] }[],
      });
    }
    const chartKeys = [...new Set(keysRaw.split(',').map((k) => k.trim()).filter(Boolean))].slice(0, 10);
    if (chartKeys.length === 0) {
      return NextResponse.json({ memberCount: 0, distributions: [] });
    }

    const filters = parseFiltersJson(searchParams.get('filters'));
    if (filters === null) {
      return NextResponse.json({ error: 'filters deve ser um objeto JSON válido' }, { status: 400 });
    }

    const memberRows = await queryMany<{ id: string }>(
      `SELECT id FROM members WHERE group_id = $1 AND is_active = TRUE`,
      [leader.group_id]
    );
    const allMemberIds = memberRows.map((r) => r.id);
    if (allMemberIds.length === 0) {
      return NextResponse.json({ memberCount: 0, distributions: chartKeys.map((tagKey) => ({ tagKey, buckets: [] })) });
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

    const byMember = new Map<string, Map<string, string>>();
    for (const row of tagRows) {
      if (!byMember.has(row.member_id)) byMember.set(row.member_id, new Map());
      byMember.get(row.member_id)!.set(row.tag_key, row.tag_value);
    }

    const passesFilters = (memberId: string): boolean => {
      const tags = byMember.get(memberId);
      for (const fk of filterKeys) {
        const allowed = filters[fk];
        if (!allowed?.length) continue;
        const v = tags?.get(fk);
        if (v === undefined || !allowed.includes(v)) return false;
      }
      return true;
    };

    const filteredMembers = allMemberIds.filter(passesFilters);

    const distributions = chartKeys.map((tagKey) => {
      const bucketMap = new Map<string, number>();
      let semTag = 0;
      for (const mid of filteredMembers) {
        const tags = byMember.get(mid);
        const v = tags?.get(tagKey);
        if (v === undefined) {
          semTag += 1;
        } else {
          bucketMap.set(v, (bucketMap.get(v) ?? 0) + 1);
        }
      }
      const buckets: { value: string; count: number }[] = [];
      if (semTag > 0) buckets.push({ value: '(sem tag)', count: semTag });
      const sorted = [...bucketMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
      for (const [value, count] of sorted) buckets.push({ value, count });
      return { tagKey, buckets };
    });

    return NextResponse.json({
      memberCount: filteredMembers.length,
      distributions,
    });
  } catch (e) {
    console.error('member-tags/analytics:', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
