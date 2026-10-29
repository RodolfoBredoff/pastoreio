/**
 * Origens de dados da página pública de lista de presença.
 *
 * - apiAttendanceSource: comportamento original (API do app na EC2).
 * - staticAttendanceSource: usado pela versão estática servida pelo S3/CloudFront.
 *   Lê o snapshot publicado no S3 e, se a EC2 estiver no ar, prefere os dados ao vivo da API.
 *
 * Sem dependências do Next.js, para poder ser usado também no build estático (Vite).
 */

export type AttendanceMode = 'prefilled' | 'open';

export type PublicAttendancePayload = {
  meeting: {
    id: string;
    title: string | null;
    meeting_date: string;
    meeting_time: string | null;
    location: string | null;
    notes: string | null;
    attendance_list_deadline: string | null;
    attendance_list_mode: AttendanceMode;
    attendance_list_require_rg: boolean;
    attendance_list_limit: number | null;
    invite_cover_image_url?: string | null;
  };
  count_confirmed: number;
  count_guests: number;
  is_expired: boolean;
  is_limit_reached: boolean;
  public_summary_only: true;
  extra_fields?: Array<{
    id: string;
    label: string;
    options: string[] | null;
    allow_custom: boolean;
    position: number;
  }>;
  extra_options_taken?: Record<string, Record<string, number>>;
};

export type AttendanceSource = {
  /** Carrega os dados públicos da lista. Lança Error com mensagem amigável. */
  load: (slug: string) => Promise<PublicAttendancePayload>;
  /** Envia uma confirmação. Lança Error com mensagem amigável. */
  submit: (slug: string, body: Record<string, unknown>) => Promise<void>;
};

/** Comportamento original da página (idêntico ao que existia antes). */
export const apiAttendanceSource: AttendanceSource = {
  async load(slug) {
    const res = await fetch(`/api/lista-presenca/${slug}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Lista não encontrada');
    return json as PublicAttendancePayload;
  },
  async submit(slug, body) {
    const res = await fetch(`/api/lista-presenca/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao confirmar');
  },
};

// ---------------------------------------------------------------------------
// Versão estática
// ---------------------------------------------------------------------------

const LIVE_TIMEOUT_MS = 2500;
const SUBMIT_TIMEOUT_MS = 10000;
const UNAVAILABLE_MESSAGE =
  'As confirmações estão temporariamente indisponíveis. Tente novamente mais tarde.';
const NOT_FOUND_MESSAGE = 'Lista não encontrada ou indisponível';

function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false;
  const t = new Date(deadline).getTime();
  return !Number.isNaN(t) && Date.now() > t;
}

/** O snapshot é estático: recalcula o que depende do horário atual. */
function normalizeSnapshot(raw: PublicAttendancePayload): PublicAttendancePayload {
  const limit = raw.meeting.attendance_list_limit;
  return {
    ...raw,
    is_expired: isDeadlinePassed(raw.meeting.attendance_list_deadline),
    is_limit_reached: limit != null && limit > 0 && raw.count_confirmed >= limit,
  };
}

type LiveResult =
  | { kind: 'ok'; data: PublicAttendancePayload }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

async function fetchLive(slug: string): Promise<LiveResult> {
  try {
    const res = await fetch(`/api/lista-presenca/${slug}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (res.status === 404) return { kind: 'not_found' };
    if (!res.ok) return { kind: 'unavailable' };
    const json = await res.json();
    if (!json || typeof json !== 'object' || !('meeting' in json)) return { kind: 'unavailable' };
    return { kind: 'ok', data: json as PublicAttendancePayload };
  } catch {
    return { kind: 'unavailable' };
  }
}

async function fetchSnapshot(slug: string): Promise<PublicAttendancePayload> {
  // Passa pelo mesmo roteamento da página; a CloudFront Function mapeia para
  // snapshots/lista-presenca/<slug>.json no S3 (o plano gratuito limita a 5 roteamentos).
  const res = await fetch(`/lista-presenca-app/snapshots/${slug}.json`, { cache: 'no-store' });
  // Objeto inexistente no S3 (sem ListBucket) responde 403
  if (res.status === 403 || res.status === 404) throw new Error(NOT_FOUND_MESSAGE);
  if (!res.ok) throw new Error('Erro ao carregar');
  const json = (await res.json()) as PublicAttendancePayload;
  if (!json?.meeting) throw new Error(NOT_FOUND_MESSAGE);
  return normalizeSnapshot(json);
}

// Lambda (via CloudFront) que recebe confirmações com a EC2 desligada.
const OFFLINE_API = '/offline-api/lista-presenca';
const OFFLINE_TIMEOUT_MS = 8000;

/** Confirmações já aceitas pela Lambda e ainda não sincronizadas com o Postgres. */
async function fetchPending(
  slug: string
): Promise<{ pending_count: number; pending_options_taken: Record<string, Record<string, number>> } | null> {
  try {
    const res = await fetch(`${OFFLINE_API}/${slug}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.pending_count === 'number' ? json : null;
  } catch {
    return null;
  }
}

function withPending(
  data: PublicAttendancePayload,
  pending: Awaited<ReturnType<typeof fetchPending>>
): PublicAttendancePayload {
  if (!pending || pending.pending_count <= 0) return data;
  const taken: Record<string, Record<string, number>> = {};
  for (const src of [data.extra_options_taken ?? {}, pending.pending_options_taken ?? {}]) {
    for (const [fieldId, opts] of Object.entries(src)) {
      taken[fieldId] ??= {};
      for (const [opt, n] of Object.entries(opts)) taken[fieldId][opt] = (taken[fieldId][opt] ?? 0) + n;
    }
  }
  const count = data.count_confirmed + pending.pending_count;
  const limit = data.meeting.attendance_list_limit;
  return {
    ...data,
    count_confirmed: count,
    extra_options_taken: taken,
    is_limit_reached: limit != null && limit > 0 && count >= limit,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function submitOffline(slug: string, body: Record<string, unknown>): Promise<void> {
  const payload = JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`${OFFLINE_API}/${slug}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Exigido pelo CloudFront (OAC) para assinar POST até a Lambda
        'x-amz-content-sha256': await sha256Hex(payload),
      },
      body: payload,
      signal: AbortSignal.timeout(OFFLINE_TIMEOUT_MS),
    });
  } catch {
    throw new Error(UNAVAILABLE_MESSAGE);
  }
  if (res.status >= 500) throw new Error(UNAVAILABLE_MESSAGE);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Erro ao confirmar');
}

// Se o último carregamento veio ao vivo, a EC2 está no ar e recebe a confirmação.
const liveBySlug = new Map<string, boolean>();

export const staticAttendanceSource: AttendanceSource = {
  async load(slug) {
    // Em paralelo: snapshot (sempre disponível) e API ao vivo (só com a EC2 ligada).
    const snapshot = fetchSnapshot(slug).then(
      (data) => ({ ok: true as const, data }),
      (error: unknown) => ({ ok: false as const, error })
    );
    const live = await fetchLive(slug);

    if (live.kind === 'ok') {
      liveBySlug.set(slug, true);
      return live.data;
    }
    if (live.kind === 'not_found') throw new Error(NOT_FOUND_MESSAGE);

    liveBySlug.set(slug, false);
    const snap = await snapshot;
    if (snap.ok) return withPending(snap.data, await fetchPending(slug));
    throw snap.error instanceof Error ? snap.error : new Error('Erro ao carregar');
  },

  async submit(slug, body) {
    if (!liveBySlug.get(slug)) return submitOffline(slug, body);

    let res: Response;
    try {
      res = await fetch(`/api/lista-presenca/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
    } catch {
      // A EC2 caiu depois que a página abriu
      liveBySlug.set(slug, false);
      return submitOffline(slug, body);
    }
    // 5xx vindos do CloudFront quando a EC2 está desligada (corpo não é JSON)
    if (res.status >= 500) {
      liveBySlug.set(slug, false);
      return submitOffline(slug, body);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao confirmar');
  },
};
