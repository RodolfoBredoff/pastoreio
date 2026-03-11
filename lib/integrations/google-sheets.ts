/**
 * Integração com Google Sheets: atualiza uma planilha de engajamento
 * (Nome | Presença | Data) sempre que a chamada é salva.
 * Usa Service Account; planilha deve ser compartilhada com o e-mail do service account.
 */

import { google } from 'googleapis';
import {
  getMeetingById,
  getGroupName,
  getMembersByGroupId,
  getAttendanceByMeeting,
} from '@/lib/db/queries';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function getCredentials(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SHEETS_CREDENTIALS_JSON;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

/**
 * Sincroniza dados de engajamento do encontro para uma aba do Google Sheets.
 * Uma linha por membro: Nome | Presença (Presente/Ausente) | Data do encontro.
 * Se GOOGLE_SHEETS_CREDENTIALS_JSON ou GOOGLE_ENGAGEMENT_SPREADSHEET_ID não estiverem
 * definidos, a função retorna sem erro (integração opcional).
 */
export async function syncEngagementToSheet(
  groupId: string,
  meetingId: string
): Promise<void> {
  const spreadsheetId = process.env.GOOGLE_ENGAGEMENT_SPREADSHEET_ID;
  if (!spreadsheetId) return;

  const credentials = getCredentials();
  if (!credentials) return;

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [SCOPE],
    });

    const [meeting, groupName, members, attendance] = await Promise.all([
      getMeetingById(meetingId),
      getGroupName(groupId),
      getMembersByGroupId(groupId),
      getAttendanceByMeeting(meetingId),
    ]);

    if (!meeting || !groupName) return;

    const attendanceByMember = new Map(
      attendance.map((a) => [a.member_id, a.is_present])
    );

    const dateLabel =
      meeting.meeting_date &&
      new Date(meeting.meeting_date + 'T12:00:00Z').toLocaleDateString('pt-BR');

    const rows: string[][] = [
      ['Nome', 'Presença', 'Data'],
      ...members.map((m) => [
        m.full_name,
        attendanceByMember.has(m.id)
          ? attendanceByMember.get(m.id)
            ? 'Presente'
            : 'Ausente'
          : 'Não registrado',
        dateLabel ?? '',
      ]),
    ];

    const sheets = google.sheets({ version: 'v4', auth });

    // Nome da aba: nome do grupo (sanitizado para caracteres válidos no Sheets)
    const sheetTitle = groupName.replace(/[\\/*?\[\]:]/g, ' ').slice(0, 100) || 'Engajamento';

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    let sheetId: number | null = null;
    for (const sheet of spreadsheet.data.sheets ?? []) {
      if (sheet.properties?.title === sheetTitle) {
        sheetId = sheet.properties.sheetId ?? null;
        break;
      }
    }

    if (sheetId === null) {
      const addSheet = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetTitle },
              },
            },
          ],
        },
      });
      sheetId =
        addSheet.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;
      if (sheetId === null) {
        console.warn('[Google Sheets] Não foi possível criar a aba:', sheetTitle);
        return;
      }
    }

    const range = `'${sheetTitle.replace(/'/g, "''")}'!A1:C${rows.length}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });
  } catch (err) {
    console.error('[Google Sheets] Erro ao sincronizar engajamento:', err);
    // Não propaga o erro para não falhar o salvamento da chamada
  }
}
