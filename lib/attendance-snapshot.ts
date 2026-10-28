import { after } from 'next/server';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client } from '@/lib/aws/s3-client';
import { queryOne } from '@/lib/db/postgres';
import { getPublicAttendanceList, type PublicAttendanceListPayload } from '@/lib/attendance-list-public';

/**
 * Snapshot público da lista de presença (Fase 1 — ver docs/DESIGN_LISTA_PRESENCA_OFFLINE.md).
 *
 * Publica no S3 o mesmo payload SEM PII que o GET /api/lista-presenca/[slug] devolve,
 * para que no futuro a página pública possa ser servida sem depender da EC2.
 *
 * Garantias para não impactar a aplicação existente:
 *  - Desligado por padrão: só roda com ATTENDANCE_SNAPSHOT_ENABLED=true.
 *  - Nunca lança erro para quem chama: falhas são apenas logadas.
 *  - scheduleAttendanceSnapshotSync() executa após a resposta HTTP (next/server `after`),
 *    sem acrescentar latência nem alterar o status da requisição original.
 *  - Chamadas ao S3 com timeout curto.
 */

export const ATTENDANCE_SNAPSHOT_SCHEMA_VERSION = 1;
const SNAPSHOT_PREFIX = 'snapshots/lista-presenca';
const S3_TIMEOUT_MS = 5000;
// Slug ([a-z0-9-]) ou token (UUID). Qualquer outra coisa é ignorada.
const IDENTIFIER_RE = /^[a-z0-9-]{1,120}$/i;

export type AttendanceSnapshot = PublicAttendanceListPayload & {
  schema_version: number;
  published_at: string;
};

export type SnapshotResult =
  | { status: 'published'; keys: string[] }
  | { status: 'removed'; keys: string[] }
  | { status: 'skipped'; reason: string };

export function isAttendanceSnapshotEnabled(): boolean {
  return process.env.ATTENDANCE_SNAPSHOT_ENABLED?.toLowerCase() === 'true';
}

function getSnapshotBucket(): string | null {
  return (
    process.env.INVITE_COVERS_BUCKET ||
    process.env.S3_BUCKET ||
    process.env.PEQUENOS_GRUPOS_BUCKET ||
    null
  );
}

export function attendanceSnapshotKey(identifier: string): string {
  return `${SNAPSHOT_PREFIX}/${identifier.toLowerCase()}.json`;
}

function validIdentifiers(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (IDENTIFIER_RE.test(trimmed)) out.add(trimmed.toLowerCase());
  }
  return [...out];
}

/**
 * Publica (ou remove, se a lista não estiver mais disponível) o snapshot do encontro.
 * `knownIdentifiers` cobre o caso em que o encontro já foi apagado do banco
 * (ex.: DELETE), permitindo remover os objetos antigos.
 */
export async function publishAttendanceSnapshotNow(
  meetingId: string,
  knownIdentifiers: Array<string | null | undefined> = []
): Promise<SnapshotResult> {
  if (!isAttendanceSnapshotEnabled()) return { status: 'skipped', reason: 'disabled' };

  const bucket = getSnapshotBucket();
  if (!bucket) return { status: 'skipped', reason: 'bucket not configured' };

  const row = await queryOne<{ attendance_list_slug: string | null; attendance_list_token: string | null }>(
    `SELECT attendance_list_slug, attendance_list_token::text AS attendance_list_token
     FROM meetings WHERE id = $1`,
    [meetingId]
  );

  const current = row ? validIdentifiers([row.attendance_list_slug, row.attendance_list_token]) : [];
  const all = validIdentifiers([...current, ...knownIdentifiers]);
  if (all.length === 0) return { status: 'skipped', reason: 'meeting has no public list' };

  // getPublicAttendanceList devolve null para encontros cancelados/inexistentes.
  const payload = current.length > 0 ? await getPublicAttendanceList(current[0]) : null;
  const s3 = getS3Client();

  if (!payload) {
    const keys = all.map(attendanceSnapshotKey);
    for (const Key of keys) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }), {
        abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS),
      });
    }
    return { status: 'removed', keys };
  }

  const snapshot: AttendanceSnapshot = {
    schema_version: ATTENDANCE_SNAPSHOT_SCHEMA_VERSION,
    published_at: new Date().toISOString(),
    ...payload,
  };
  const body = JSON.stringify(snapshot);

  const keys = current.map(attendanceSnapshotKey);
  for (const Key of keys) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key,
        Body: body,
        ContentType: 'application/json; charset=utf-8',
        CacheControl: 'public, max-age=30, stale-while-revalidate=300',
      }),
      { abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS) }
    );
  }

  // Identificadores antigos que não pertencem mais ao encontro
  const stale = all.filter((id) => !current.includes(id)).map(attendanceSnapshotKey);
  for (const Key of stale) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }), {
      abortSignal: AbortSignal.timeout(S3_TIMEOUT_MS),
    });
  }

  return { status: 'published', keys };
}

// Coalescência por encontro: se já há uma publicação em andamento, marca para
// repetir ao final em vez de rodar em paralelo. Assim a última gravação no S3
// sempre reflete o estado mais recente do banco (evita gravações fora de ordem).
const inFlight = new Map<string, { rerun: boolean; known: Set<string> }>();

async function runCoalesced(meetingId: string, knownIdentifiers: Array<string | null | undefined>) {
  const existing = inFlight.get(meetingId);
  if (existing) {
    existing.rerun = true;
    for (const id of validIdentifiers(knownIdentifiers)) existing.known.add(id);
    return;
  }

  const state = { rerun: false, known: new Set(validIdentifiers(knownIdentifiers)) };
  inFlight.set(meetingId, state);
  try {
    do {
      state.rerun = false;
      try {
        const result = await publishAttendanceSnapshotNow(meetingId, [...state.known]);
        if (result.status !== 'skipped') {
          console.info(`[attendance-snapshot] ${result.status}: ${result.keys.join(', ')}`);
        }
      } catch (error) {
        console.warn(`[attendance-snapshot] falha ao publicar snapshot do encontro ${meetingId} (ignorado):`, error);
      }
    } while (state.rerun);
  } finally {
    inFlight.delete(meetingId);
  }
}

/**
 * Agenda a (re)publicação do snapshot para depois da resposta HTTP.
 * Seguro para chamar em qualquer rota: não lança, não bloqueia, não altera a resposta.
 */
export function scheduleAttendanceSnapshotSync(
  meetingId: string | null | undefined,
  knownIdentifiers: Array<string | null | undefined> = []
): void {
  try {
    if (!meetingId || !isAttendanceSnapshotEnabled()) return;
    const task = () => runCoalesced(String(meetingId), knownIdentifiers);
    try {
      after(task);
    } catch {
      // Fora de um contexto de requisição: executa em segundo plano mesmo assim.
      void task();
    }
  } catch (error) {
    console.warn('[attendance-snapshot] falha ao agendar snapshot (ignorado):', error);
  }
}

/**
 * Variante para rotas que só conhecem o slug/token (ex.: POST público).
 * A resolução do id acontece dentro da tarefa agendada, após a resposta.
 */
export function scheduleAttendanceSnapshotSyncForIdentifier(identifier: string | null | undefined): void {
  try {
    if (!identifier || !isAttendanceSnapshotEnabled()) return;
    const [id] = validIdentifiers([identifier]);
    if (!id) return;
    const task = async () => {
      try {
        const row = await queryOne<{ id: string }>(
          `SELECT id FROM meetings WHERE attendance_list_slug = $1 OR attendance_list_token::text = $1 LIMIT 1`,
          [id]
        );
        if (row?.id) await runCoalesced(row.id, []);
      } catch (error) {
        console.warn('[attendance-snapshot] falha ao resolver encontro do snapshot (ignorado):', error);
      }
    };
    try {
      after(task);
    } catch {
      void task();
    }
  } catch (error) {
    console.warn('[attendance-snapshot] falha ao agendar snapshot (ignorado):', error);
  }
}
