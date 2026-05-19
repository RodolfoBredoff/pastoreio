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

/**
 * Constrói um mapa de tags por membro, onde cada tag pode ter múltiplos valores.
 * @returns Map<member_id, Map<tag_key, tag_values[]>>
 */
export function buildMemberTagMap(
  tagRows: { member_id: string; tag_key: string; tag_value: string }[]
): Map<string, Map<string, string[]>> {
  const byMember = new Map<string, Map<string, string[]>>();
  for (const row of tagRows) {
    if (!byMember.has(row.member_id)) {
      byMember.set(row.member_id, new Map());
    }
    const memberTags = byMember.get(row.member_id)!;
    if (!memberTags.has(row.tag_key)) {
      memberTags.set(row.tag_key, []);
    }
    memberTags.get(row.tag_key)!.push(row.tag_value);
  }
  return byMember;
}

/**
 * Versão antiga mantida para compatibilidade (retorna apenas o primeiro valor).
 * @deprecated Use buildMemberTagMap que suporta múltiplos valores
 */
export function buildMemberTagMapLegacy(
  tagRows: { member_id: string; tag_key: string; tag_value: string }[]
): Map<string, Map<string, string>> {
  const byMember = new Map<string, Map<string, string>>();
  for (const row of tagRows) {
    if (!byMember.has(row.member_id)) byMember.set(row.member_id, new Map());
    byMember.get(row.member_id)!.set(row.tag_key, row.tag_value);
  }
  return byMember;
}

/**
 * Filtra membros por tags com suporte a múltiplos valores e modo AND/OR.
 * @param mode 'AND' = membro deve passar em TODOS os filtros | 'OR' = membro deve passar em PELO MENOS UM filtro
 */
export function filterMemberIdsByTagFiltersWithMode(
  allMemberIds: string[],
  byMember: Map<string, Map<string, string[]>>,
  filters: TagFiltersPayload,
  mode: 'AND' | 'OR' = 'AND'
): string[] {
  const filterKeys = Object.keys(filters).filter((k) => filters[k]?.length > 0);
  
  if (filterKeys.length === 0) {
    return allMemberIds;
  }

  const passesFilter = (memberId: string, filterKey: string): boolean => {
    const allowed = filters[filterKey];
    if (!allowed?.length) return true;
    
    const tags = byMember.get(memberId);
    const memberValues = tags?.get(filterKey);
    
    if (!memberValues || memberValues.length === 0) return false;
    
    // Verifica se QUALQUER valor do membro corresponde ao filtro
    return memberValues.some(v => allowed.includes(v));
  };

  if (mode === 'OR') {
    // OR: membro passa se corresponder a PELO MENOS UM filtro
    return allMemberIds.filter(memberId => 
      filterKeys.some(fk => passesFilter(memberId, fk))
    );
  } else {
    // AND: membro passa se corresponder a TODOS os filtros
    return allMemberIds.filter(memberId => 
      filterKeys.every(fk => passesFilter(memberId, fk))
    );
  }
}

/**
 * Versão antiga mantida para compatibilidade (sem múltiplos valores).
 * @deprecated Use filterMemberIdsByTagFiltersWithMode
 */
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

/**
 * Concatena múltiplos valores de uma tag para exibição.
 * @param values Array de valores a concatenar
 * @param separator Separador entre valores (padrão: ', ')
 * @returns String concatenada ordenada alfabeticamente
 */
export function concatenateTagValues(values: string[], separator: string = ', '): string {
  if (!values || values.length === 0) return '';
  return [...values].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(separator);
}

/** Rótulo usado no gráfico e na API para "sem esta tag". */
export const TAG_BUCKET_SEM_TAG = '(sem tag)';
