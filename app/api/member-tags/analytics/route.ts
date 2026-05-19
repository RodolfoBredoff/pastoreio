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
 * GET /api/member-tags/analytics?keys=a,b,c&filters={"chave":["v1"]}&mode=AND
 * Para cada chave em `keys`, histograma de valores entre membros ativos do grupo.
 * @param keys - Chaves de tags para criar histogramas
 * @param filters - Filtros a aplicar (formato JSON)
 * @param mode - 'AND' (padrão) ou 'OR' para combinar filtros
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

    const filters = parseTagFiltersJson(searchParams.get('filters'));
    if (filters === null) {
      return NextResponse.json({ error: 'filters deve ser um objeto JSON válido' }, { status: 400 });
    }

    const mode = (searchParams.get('mode')?.toUpperCase() === 'OR' ? 'OR' : 'AND') as 'AND' | 'OR';

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

    const byMember = buildMemberTagMap(tagRows);
    const filteredMembers = filterMemberIdsByTagFiltersWithMode(allMemberIds, byMember, filters, mode);

    const distributions = chartKeys.map((tagKey) => {
      const bucketMap = new Map<string, number>();
      let semTag = 0;
      for (const mid of filteredMembers) {
        const tags = byMember.get(mid);
        const values = tags?.get(tagKey);
        if (!values || values.length === 0) {
          semTag += 1;
        } else {
          // Concatenar múltiplos valores para exibição como um único bucket
          const concatenated = concatenateTagValues(values);
          bucketMap.set(concatenated, (bucketMap.get(concatenated) ?? 0) + 1);
        }
      }
      const buckets: { value: string; count: number }[] = [];
      if (semTag > 0) buckets.push({ value: TAG_BUCKET_SEM_TAG, count: semTag });
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
