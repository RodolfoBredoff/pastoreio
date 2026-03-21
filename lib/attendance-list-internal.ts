/** Prefixos para chaves em attendance_list_internal_checks (JSONB) */
export const INTERNAL_CHECK_MEMBER_PREFIX = 'm:';
export const INTERNAL_CHECK_GUEST_PREFIX = 'g:';

export type InternalCheckPair = { a: boolean; b: boolean };

export function internalCheckKeyMember(memberId: string): string {
  return `${INTERNAL_CHECK_MEMBER_PREFIX}${memberId}`;
}

export function internalCheckKeyGuest(guestId: string): string {
  return `${INTERNAL_CHECK_GUEST_PREFIX}${guestId}`;
}

export function emptyCheckPair(): InternalCheckPair {
  return { a: false, b: false };
}

/**
 * Valor por linha: { a, b } (dois checkboxes). Legado: boolean vira { a: v, b: false }.
 */
export function normalizeInternalChecks(
  raw: Record<string, unknown> | null | undefined
): Record<string, InternalCheckPair> {
  const out: Record<string, InternalCheckPair> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const key =
      k.startsWith(INTERNAL_CHECK_MEMBER_PREFIX) || k.startsWith(INTERNAL_CHECK_GUEST_PREFIX)
        ? k
        : internalCheckKeyMember(k);
    if (typeof v === 'boolean') {
      out[key] = { a: v, b: false };
    } else if (v && typeof v === 'object' && v !== null && 'a' in v && 'b' in v) {
      const o = v as { a?: unknown; b?: unknown };
      out[key] = { a: Boolean(o.a), b: Boolean(o.b) };
    } else {
      out[key] = { a: false, b: false };
    }
  }
  return out;
}

export function getPair(
  checks: Record<string, InternalCheckPair>,
  rowKey: string
): InternalCheckPair {
  return checks[rowKey] ?? emptyCheckPair();
}
