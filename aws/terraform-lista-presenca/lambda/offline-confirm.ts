/**
 * Lambda de confirmação de presença com a EC2 desligada (modo "open").
 *
 * GET  /offline-api/lista-presenca/<slug> -> totais pendentes no buffer (sem PII)
 * POST /offline-api/lista-presenca/<slug> -> valida e grava a confirmação no DynamoDB
 *
 * Fonte de verdade da lista: o snapshot público no S3 (o mesmo que a página lê).
 * As confirmações ficam no buffer até a EC2 ligar e o app sincronizar com o Postgres
 * (POST /api/cron/sync-attendance-buffer). Validações iguais às do app
 * (lib/attendance-list-rules, lib/attendance-list-public#publicCreateOpenEntry).
 */
import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import {
  isAttendanceLimitReached,
  isMeetingExpired,
  isValidRg,
  normalizeExtraValues,
  normalizeRg,
  type AttendanceExtraFieldConfig,
  type ExtraValuesEntry,
} from '../../../lib/attendance-list-rules';

const BUCKET = process.env.SNAPSHOT_BUCKET!;
const PREFIX = process.env.SNAPSHOT_PREFIX || 'snapshots/lista-presenca';
const TABLE = process.env.BUFFER_TABLE!;
const PATH_PREFIX = '/offline-api/lista-presenca/';
const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const MAX_BODY_BYTES = 8 * 1024;
const TTL_DAYS = 120;

const s3 = new S3Client({});
const ddb = new DynamoDBClient({});

type Snapshot = {
  meeting: {
    id: string;
    attendance_list_deadline: string | null;
    attendance_list_mode: 'open' | 'prefilled';
    attendance_list_require_rg: boolean;
    attendance_list_limit: number | null;
  };
  extra_fields?: AttendanceExtraFieldConfig[];
  count_confirmed: number;
};

type FunctionUrlEvent = {
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string } };
};

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

async function loadSnapshot(slug: string): Promise<Snapshot | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/${slug}.json` }));
    const parsed = JSON.parse(await res.Body!.transformToString()) as Snapshot;
    return parsed?.meeting?.id ? parsed : null;
  } catch (e) {
    if ((e as { name?: string }).name === 'NoSuchKey' || (e as { name?: string }).name === 'AccessDenied') return null;
    throw e;
  }
}

/** Confirmações ainda não sincronizadas deste encontro (contagem e escolhas). */
async function pendingSummary(meetingId: string) {
  let count = 0;
  const taken: Record<string, Record<string, number>> = {};
  let startKey: Record<string, never> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pk': { S: `MEETING#${meetingId}` }, ':pending': { S: 'pending' } },
        ProjectionExpression: 'extra_values',
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of page.Items ?? []) {
      count += 1;
      const values = JSON.parse(item.extra_values?.S ?? '[]') as ExtraValuesEntry[];
      for (const v of values) {
        for (const opt of v.values) {
          taken[v.field_id] ??= {};
          taken[v.field_id][opt] = (taken[v.field_id][opt] ?? 0) + 1;
        }
      }
    }
    startKey = page.LastEvaluatedKey as typeof startKey;
  } while (startKey);
  return { count, taken };
}

/** Conta a opção pelo nome canônico da configuração (mesma regra do app). */
function canonicalTaken(fields: AttendanceExtraFieldConfig[], raw: Record<string, Record<string, number>>) {
  const out: Record<string, Record<string, number>> = {};
  for (const f of fields) {
    if (!f.options) continue;
    const byLower = new Map(f.options.map((o) => [o.toLowerCase(), o]));
    for (const [value, n] of Object.entries(raw[f.id] ?? {})) {
      const canonical = byLower.get(value.trim().toLowerCase());
      if (!canonical) continue;
      out[f.id] ??= {};
      out[f.id][canonical] = (out[f.id][canonical] ?? 0) + n;
    }
  }
  return out;
}

async function handleGet(slug: string) {
  const snapshot = await loadSnapshot(slug);
  if (!snapshot) return json(404, { error: 'Lista não encontrada ou indisponível' });
  const pending = await pendingSummary(snapshot.meeting.id);
  return json(200, {
    pending_count: pending.count,
    pending_options_taken: canonicalTaken(snapshot.extra_fields ?? [], pending.taken),
  });
}

async function handlePost(slug: string, rawBody: string) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: 'Requisição inválida' });
  }

  const snapshot = await loadSnapshot(slug);
  if (!snapshot) return json(404, { error: 'Lista não encontrada ou indisponível' });
  const { meeting } = snapshot;

  if (meeting.attendance_list_mode !== 'open' || body.mode !== 'open') {
    // Modo "prefilled" depende da base de membros (Postgres) — só com a EC2 ligada.
    return json(409, {
      error: 'As confirmações estão temporariamente indisponíveis. Tente novamente mais tarde.',
    });
  }
  if (isMeetingExpired(meeting.attendance_list_deadline)) {
    return json(400, { error: 'O prazo para confirmação deste encontro já foi encerrado.' });
  }

  const fields = snapshot.extra_fields ?? [];
  let extraValues: ExtraValuesEntry[] = [];
  if (fields.length > 0) {
    const res = normalizeExtraValues(fields, body.extra_values);
    if (!res.ok) return json(400, { error: res.error });
    extraValues = res.values;
  }

  const pending = await pendingSummary(meeting.id);
  if (isAttendanceLimitReached(snapshot.count_confirmed + pending.count, meeting.attendance_list_limit)) {
    return json(400, { error: 'O limite de inscrições para este evento já foi atingido.' });
  }

  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const firstName = str(body.first_name).trim().slice(0, 120);
  const lastName = str(body.last_name).trim().slice(0, 120);
  const emailVal = str(body.email).trim().toLowerCase().slice(0, 255);
  const phoneVal = str(body.phone).replace(/\D/g, '').slice(0, 20);
  const hasEmail = Boolean(emailVal) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  const hasPhone = phoneVal.length >= 10;
  const rgVal = normalizeRg(str(body.rg));

  if (!firstName) return json(400, { error: 'Informe o nome.' });
  if (!lastName) return json(400, { error: 'Informe o sobrenome.' });
  if (!hasEmail && !hasPhone) return json(400, { error: 'Informe um e-mail válido ou telefone (com DDD).' });
  if (meeting.attendance_list_require_rg) {
    if (!rgVal) return json(400, { error: 'Informe o RG.' });
    if (!isValidRg(rgVal)) return json(400, { error: 'Informe um RG válido.' });
  }

  // Idempotência: o mesmo envio (reenvio do formulário) não gera duas entradas.
  const contact = hasEmail ? emailVal : phoneVal;
  const dedupe = createHash('sha256')
    .update([meeting.id, firstName.toLowerCase(), lastName.toLowerCase(), contact].join('|'))
    .digest('hex');

  const now = new Date();
  try {
    await ddb.send(
      new PutItemCommand({
        TableName: TABLE,
        Item: {
          pk: { S: `MEETING#${meeting.id}` },
          sk: { S: `ENTRY#${dedupe}` },
          status: { S: 'pending' },
          meeting_id: { S: meeting.id },
          slug: { S: slug },
          mode: { S: 'open' },
          first_name: { S: firstName },
          last_name: { S: lastName },
          ...(hasEmail ? { email: { S: emailVal } } : {}),
          ...(hasPhone ? { phone: { S: phoneVal } } : {}),
          ...(meeting.attendance_list_require_rg ? { rg: { S: rgVal } } : {}),
          extra_values: { S: JSON.stringify(extraValues) },
          dedupe_key: { S: dedupe },
          created_at: { S: now.toISOString() },
          ttl: { N: String(Math.floor(now.getTime() / 1000) + TTL_DAYS * 86400) },
        },
        ConditionExpression: 'attribute_not_exists(sk)',
      })
    );
  } catch (e) {
    if (!(e instanceof ConditionalCheckFailedException)) throw e;
    // Já registrado antes: responde como sucesso.
  }
  return json(201, { ok: true });
}

export async function handler(event: FunctionUrlEvent) {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath ?? '';
    if (!path.startsWith(PATH_PREFIX)) return json(404, { error: 'Não encontrado' });
    const slug = decodeURIComponent(path.slice(PATH_PREFIX.length)).toLowerCase();
    if (!SLUG_RE.test(slug)) return json(400, { error: 'Link inválido' });

    if (method === 'GET') return await handleGet(slug);
    if (method === 'POST') {
      const raw = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? '';
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(413, { error: 'Requisição muito grande' });
      return await handlePost(slug, raw);
    }
    return json(405, { error: 'Método não permitido' });
  } catch (error) {
    console.error('offline-confirm error', error);
    return json(500, { error: 'Erro ao registrar' });
  }
}
