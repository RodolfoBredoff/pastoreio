export interface MetricMember {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  is_active: boolean;
  status: 'active' | 'inactive' | 'retained' | 'churned';
  frequency_rate: number;
}

export async function fetchMembersByIds(ids: string[]): Promise<MetricMember[]> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const res = await fetch(`/api/members?ids=${uniqueIds.join(',')}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Erro ${res.status} ao buscar membros`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchCohortMembers(
  cohortStart: string,
  cohortEnd: string,
  memberFilter: string
): Promise<MetricMember[]> {
  const params = new URLSearchParams({
    created_after: cohortStart,
    created_before: cohortEnd,
    member_filter: memberFilter,
    retention_context: 'true',
  });

  const res = await fetch(`/api/members?${params}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Erro ${res.status} ao buscar cohort`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
