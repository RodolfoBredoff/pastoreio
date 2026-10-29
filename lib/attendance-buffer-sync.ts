import {
  DeleteItemCommand,
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { insertBufferedOpenEntry } from '@/lib/attendance-list-public';
import { publishAttendanceSnapshotNow } from '@/lib/attendance-snapshot';

/**
 * Sincroniza o buffer de confirmações (DynamoDB, gravado pela Lambda com a EC2 desligada)
 * com o Postgres. Ver docs/DESIGN_LISTA_PRESENCA_OFFLINE.md.
 *
 * - Cada item "pending" vira uma linha em attendance_list_public_entries com id
 *   determinístico (derivado da chave de deduplicação) → rodar duas vezes não duplica.
 * - Sucesso: item removido do buffer. Falha de regra: item marcado "failed" com o motivo
 *   (fica para análise e não é reprocessado). Erro técnico: item mantido para a próxima rodada.
 * - Ao final, republica o snapshot de cada encontro afetado.
 */

const TABLE = process.env.ATTENDANCE_BUFFER_TABLE || 'pastoreio-attendance-buffer';

let client: DynamoDBClient | null = null;
function ddb(): DynamoDBClient {
  if (!process.env.AWS_REGION) throw new Error('AWS_REGION não configurada.');
  client ??= new DynamoDBClient({ region: process.env.AWS_REGION });
  return client;
}

/** UUID estável a partir do hash hex de deduplicação (formato v4 válido). */
export function entryIdFromDedupe(hex: string): string {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, '').padEnd(32, '0').slice(0, 32);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const s = (item: Record<string, AttributeValue>, key: string) => item[key]?.S;

export type BufferSyncResult = {
  scanned: number;
  inserted: number;
  already_present: number;
  failed: Array<{ meeting_id: string; key: string; error: string }>;
  retry_later: number;
  snapshots_republished: number;
};

export async function syncAttendanceBuffer(): Promise<BufferSyncResult> {
  const result: BufferSyncResult = {
    scanned: 0,
    inserted: 0,
    already_present: 0,
    failed: [],
    retry_later: 0,
    snapshots_republished: 0,
  };
  const touched = new Set<string>();

  let startKey: Record<string, AttributeValue> | undefined;
  do {
    const page = await ddb().send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pending': { S: 'pending' } },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of page.Items ?? []) {
      result.scanned += 1;
      const key = { pk: item.pk, sk: item.sk };
      const meetingId = s(item, 'meeting_id') ?? '';
      const dedupe = s(item, 'dedupe_key') ?? '';

      try {
        if (s(item, 'mode') !== 'open' || !meetingId || !dedupe) {
          throw Object.assign(new Error('Item inválido no buffer'), { permanent: true });
        }
        const res = await insertBufferedOpenEntry({
          entryId: entryIdFromDedupe(dedupe),
          meetingId,
          first_name: s(item, 'first_name') ?? '',
          last_name: s(item, 'last_name') ?? '',
          email: s(item, 'email') ?? null,
          phone: s(item, 'phone') ?? null,
          rg: s(item, 'rg') ?? null,
          extra_values: JSON.parse(s(item, 'extra_values') ?? '[]'),
          created_at: s(item, 'created_at') ?? new Date().toISOString(),
        });
        if (!res.ok) throw Object.assign(new Error(res.error), { permanent: true });

        await ddb().send(new DeleteItemCommand({ TableName: TABLE, Key: key }));
        if (res.inserted) result.inserted += 1;
        else result.already_present += 1;
        touched.add(meetingId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if ((error as { permanent?: boolean }).permanent) {
          result.failed.push({ meeting_id: meetingId, key: s(item, 'sk') ?? '', error: message });
          await ddb()
            .send(
              new UpdateItemCommand({
                TableName: TABLE,
                Key: key,
                UpdateExpression: 'SET #s = :failed, sync_error = :e, failed_at = :t',
                ExpressionAttributeNames: { '#s': 'status' },
                ExpressionAttributeValues: {
                  ':failed': { S: 'failed' },
                  ':e': { S: message.slice(0, 500) },
                  ':t': { S: new Date().toISOString() },
                },
              })
            )
            .catch((e) => console.warn('[attendance-buffer] falha ao marcar item como failed:', e));
        } else {
          result.retry_later += 1;
          console.warn('[attendance-buffer] erro temporário, item mantido para a próxima rodada:', error);
        }
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);

  for (const meetingId of touched) {
    try {
      const r = await publishAttendanceSnapshotNow(meetingId);
      if (r.status === 'published') result.snapshots_republished += 1;
    } catch (error) {
      console.warn(`[attendance-buffer] falha ao republicar snapshot ${meetingId}:`, error);
    }
  }

  return result;
}
