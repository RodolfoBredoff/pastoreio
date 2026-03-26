export type TagFiltersPayload = Record<string, string[]>;

export function parseTagFiltersJson(raw: string | null): TagFiltersPayload | null {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: TagFiltersPayload = {};
    for (const [k, val] of Object.entries(v)) {
      const key = k.trim();
      if (!key) continue;
      if (!Array.isArray(val)) continue;
      const strings = val.filter((x): x is string => typeof x === 'string');
      if (strings.length > 0) out[key] = strings;
    }
    return out;
  } catch {
    return null;
  }
}

export function buildMemberTagMap(
  tagRows: { member_id: string; tag_key: string; tag_value: string }[]
): Map<string, Map<string, string>> {
  const byMember = new Map<string, Map<string, string>>();
  for (const row of tagRows) {
    if (!byMember.has(row.member_id)) byMember.set(row.member_id, new Map());
    byMember.get(row.member_id)!.set(row.tag_key, row.tag_value);
  }
  return byMember;
}

export function filterMemberIdsByTagFilters(
  allMemberIds: string[],
  byMember: Map<string, Map<string, string>>,
  filters: TagFiltersPayload
): string[] {
  const filterKeys = Object.keys(filters).filter((k) => filters[k]?.length > 0);
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
  return allMemberIds.filter(passesFilters);
}

/** Rótulo usado no gráfico e na API para “sem esta tag”. */
export const TAG_BUCKET_SEM_TAG = '(sem tag)';
