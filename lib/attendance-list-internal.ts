/** Prefixos para chaves em attendance_list_internal_checks (JSONB) */
export const INTERNAL_CHECK_MEMBER_PREFIX = 'm:';
export const INTERNAL_CHECK_GUEST_PREFIX = 'g:';

export function internalCheckKeyMember(memberId: string): string {
  return `${INTERNAL_CHECK_MEMBER_PREFIX}${memberId}`;
}

export function internalCheckKeyGuest(guestId: string): string {
  return `${INTERNAL_CHECK_GUEST_PREFIX}${guestId}`;
}

/**
 * Normaliza o mapa salvo: chaves antigas (só UUID de membro) viram m:uuid.
 */
export function normalizeInternalChecks(raw: Record<string, boolean> | null | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (k.startsWith(INTERNAL_CHECK_MEMBER_PREFIX) || k.startsWith(INTERNAL_CHECK_GUEST_PREFIX)) {
      out[k] = Boolean(v);
    } else {
      out[internalCheckKeyMember(k)] = Boolean(v);
    }
  }
  return out;
}
