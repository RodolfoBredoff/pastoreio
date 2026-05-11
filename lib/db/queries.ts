import { query, queryOne, queryMany, transaction } from './postgres';
import { requireAuth } from '@/lib/auth/session';

// ============================================
// TIPOS
// ============================================

export interface Leader {
  id: string;
  organization_id: string;
  group_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'leader' | 'secretary' | 'coordinator';
  created_at: string;
}

export interface Member {
  id: string;
  group_id: string;
  full_name: string;
  phone: string;
  birth_date: string | null;
  member_type: 'participant' | 'visitor';
  is_active: boolean;
  integration_stage: 'novo_visitante' | 'retornou' | 'integrando' | 'membro';
  marked_not_returned?: boolean;
  created_at: string;
  updated_at: string;
  /** ID do membro que discipula este (mesmo grupo). */
  discipulador_id?: string | null;
  /** Nome do discipulador (preenchido por JOIN nas queries). */
  discipulador_full_name?: string | null;
  /** Nomes dos membros que este discipula (preenchido por subquery). */
  discipulador_de?: string[] | null;
}

export interface Meeting {
  id: string;
  group_id: string;
  meeting_date: string;
  meeting_time: string | null;
  title: string | null;
  is_cancelled: boolean;
  notes: string | null;
  meeting_type: 'regular' | 'special_event';
  created_at: string;
}

export interface Attendance {
  id: string;
  meeting_id: string;
  member_id: string;
  is_present: boolean;
  created_at: string;
}

export interface GuestVisitor {
  id: string;
  group_id: string;
  full_name: string;
  phone: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  group_id: string;
  notification_type: 'absence_alert' | 'birthday' | 'visitor_dropoff';
  member_id: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  organization_id: string;
  name: string;
  default_meeting_day: number;
  default_meeting_time: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// QUERIES DE LÍDERES
// ============================================

/**
 * Busca o líder atual e seu grupo
 */
export async function getCurrentLeader(): Promise<Leader | null> {
  const user = await requireAuth();
  
  return queryOne<Leader>(
    `SELECT * FROM leaders WHERE id = $1`,
    [user.id]
  );
}

/**
 * Busca líder por ID
 */
export async function getLeaderById(leaderId: string): Promise<Leader | null> {
  return queryOne<Leader>(
    `SELECT * FROM leaders WHERE id = $1`,
    [leaderId]
  );
}

// ============================================
// QUERIES DE MEMBROS
// ============================================

/**
 * Busca todos os membros ativos do grupo do líder atual
 */
export async function getMembersByLeaderGroup(): Promise<Member[]> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return [];
  }

  return queryMany<Member>(
    `SELECT m.id, m.group_id, m.full_name, m.phone, m.birth_date, m.member_type, m.is_active, m.created_at, m.updated_at, m.discipulador_id, m.integration_stage, m.marked_not_returned,
            d.full_name AS discipulador_full_name,
            (SELECT COALESCE(array_agg(m2.full_name ORDER BY m2.full_name), ARRAY[]::text[]) FROM members m2 WHERE m2.discipulador_id = m.id AND m2.is_active = TRUE) AS discipulador_de
     FROM members m
     LEFT JOIN members d ON d.id = m.discipulador_id
     WHERE m.group_id = $1 AND m.is_active = TRUE
     ORDER BY m.full_name ASC`,
    [leader.group_id]
  );
}

/**
 * Busca membro por ID e grupo (para validação em API; não usa sessão).
 */
export async function getMemberByIdAndGroup(memberId: string, groupId: string): Promise<Member | null> {
  return queryOne<Member>(
    `SELECT * FROM members WHERE id = $1 AND group_id = $2`,
    [memberId, groupId]
  );
}

/**
 * Busca membro por ID (verificando permissão do líder)
 */
export async function getMemberById(memberId: string): Promise<Member | null> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return null;
  }

  return queryOne<Member>(
    `SELECT m.id, m.group_id, m.full_name, m.phone, m.birth_date, m.member_type, m.is_active, m.created_at, m.updated_at, m.discipulador_id, m.integration_stage, m.marked_not_returned,
            d.full_name AS discipulador_full_name,
            (SELECT COALESCE(array_agg(m2.full_name ORDER BY m2.full_name), ARRAY[]::text[]) FROM members m2 WHERE m2.discipulador_id = m.id AND m2.is_active = TRUE) AS discipulador_de
     FROM members m
     LEFT JOIN members d ON d.id = m.discipulador_id
     WHERE m.id = $1 AND m.group_id = $2`,
    [memberId, leader.group_id]
  );
}

/**
 * Cria um novo membro
 */
export async function createMember(data: {
  full_name: string;
  phone: string;
  birth_date: string;
  member_type: 'participant' | 'visitor';
}): Promise<Member> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    throw new Error('Líder não está vinculado a um grupo');
  }

  const result = await query<Member>(
    `INSERT INTO members (group_id, full_name, phone, birth_date, member_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [leader.group_id, data.full_name, data.phone, data.birth_date, data.member_type]
  );

  return result.rows[0];
}

/**
 * Atualiza um membro
 */
export async function updateMember(memberId: string, data: {
  full_name?: string;
  phone?: string;
  birth_date?: string | null;
  member_type?: 'participant' | 'visitor';
  is_active?: boolean;
  discipulador_id?: string | null;
}): Promise<Member | null> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    throw new Error('Líder não está vinculado a um grupo');
  }

  // Verificar se o membro pertence ao grupo do líder
  const member = await getMemberById(memberId);
  if (!member) {
    return null;
  }

  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.full_name !== undefined) {
    updates.push(`full_name = $${paramIndex++}`);
    values.push(data.full_name);
  }
  if (data.phone !== undefined) {
    updates.push(`phone = $${paramIndex++}`);
    values.push(data.phone);
  }
  if (data.birth_date !== undefined) {
    updates.push(`birth_date = $${paramIndex++}`);
    values.push(data.birth_date);
  }
  if (data.member_type !== undefined) {
    updates.push(`member_type = $${paramIndex++}`);
    values.push(data.member_type);
  }
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    values.push(data.is_active);
  }
  if (data.discipulador_id !== undefined) {
    updates.push(`discipulador_id = $${paramIndex++}`);
    values.push(data.discipulador_id);
  }

  if (updates.length === 0) {
    return member;
  }

  values.push(memberId);
  const result = await query<Member>(
    `UPDATE members 
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Remove um membro (soft delete)
 */
export async function deleteMember(memberId: string): Promise<boolean> {
  const member = await updateMember(memberId, { is_active: false });
  return member !== null;
}

// ============================================
// QUERIES DE REUNIÕES
// ============================================

/**
 * Busca próximas reuniões do grupo do líder
 */
export async function getUpcomingMeetings(limit: number = 30): Promise<Meeting[]> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return [];
  }

  return queryMany<Meeting>(
    `SELECT * FROM meetings 
     WHERE group_id = $1 
     AND meeting_date >= CURRENT_DATE
     AND is_cancelled = FALSE
     ORDER BY meeting_date ASC
     LIMIT $2`,
    [leader.group_id, limit]
  );
}

/**
 * Busca reuniões passadas do grupo do líder
 */
export async function getPastMeetings(limit: number = 10): Promise<Meeting[]> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return [];
  }

  return queryMany<Meeting>(
    `SELECT * FROM meetings 
     WHERE group_id = $1 
     AND meeting_date < CURRENT_DATE
     ORDER BY meeting_date DESC
     LIMIT $2`,
    [leader.group_id, limit]
  );
}

/**
 * Busca reuniões do grupo para seleção (presença)
 * Inclui passadas e futuras, ordenadas por data decrescente (mais recente primeiro)
 */
export async function getMeetingsForPresence(limit: number = 50): Promise<Meeting[]> {
  const leader = await getCurrentLeader();
  if (!leader?.group_id) return [];

  return queryMany<Meeting>(
    `SELECT * FROM meetings 
     WHERE group_id = $1 AND is_cancelled = FALSE
     ORDER BY meeting_date DESC
     LIMIT $2`,
    [leader.group_id, limit]
  );
}

/**
 * Busca reunião por data
 */
export async function getMeetingByDate(date: string): Promise<Meeting | null> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return null;
  }

  return queryOne<Meeting>(
    `SELECT * FROM meetings 
     WHERE group_id = $1 AND meeting_date = $2`,
    [leader.group_id, date]
  );
}

/**
 * Cria ou atualiza uma reunião
 */
export async function upsertMeeting(data: {
  meeting_date: string;
  is_cancelled?: boolean;
  notes?: string | null;
}): Promise<Meeting> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    throw new Error('Líder não está vinculado a um grupo');
  }

  const result = await query<Meeting>(
    `INSERT INTO meetings (group_id, meeting_date, is_cancelled, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (group_id, meeting_date)
     DO UPDATE SET 
       is_cancelled = EXCLUDED.is_cancelled,
       notes = EXCLUDED.notes
     RETURNING *`,
    [leader.group_id, data.meeting_date, data.is_cancelled || false, data.notes || null]
  );

  return result.rows[0];
}

// ============================================
// QUERIES DE PRESENÇA
// ============================================

/**
 * Busca reunião por ID (uso interno; não verifica líder).
 */
export async function getMeetingById(meetingId: string): Promise<Meeting | null> {
  return queryOne<Meeting>(`SELECT * FROM meetings WHERE id = $1`, [meetingId]);
}

/**
 * Busca nome do grupo por ID (uso interno).
 */
export async function getGroupName(groupId: string): Promise<string | null> {
  const row = await queryOne<{ name: string }>(`SELECT name FROM groups WHERE id = $1`, [groupId]);
  return row?.name ?? null;
}

/**
 * Busca membros ativos do grupo por group_id (uso interno; ex.: integração Google Sheets).
 */
export async function getMembersByGroupId(groupId: string): Promise<{ id: string; full_name: string }[]> {
  return queryMany<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM members WHERE group_id = $1 AND is_active = TRUE ORDER BY full_name ASC`,
    [groupId]
  );
}

/**
 * Busca presenças de uma reunião
 */
export async function getAttendanceByMeeting(meetingId: string): Promise<Attendance[]> {
  return queryMany<Attendance>(
    `SELECT * FROM attendance WHERE meeting_id = $1`,
    [meetingId]
  );
}

/**
 * Busca visitantes presentes em um encontro
 */
export async function getAttendanceGuestsByMeeting(meetingId: string): Promise<GuestVisitor[]> {
  return queryMany<GuestVisitor>(
    `SELECT g.id, g.group_id, g.full_name, g.phone, g.created_at
     FROM attendance_guests ag
     JOIN guest_visitors g ON g.id = ag.guest_id
     WHERE ag.meeting_id = $1
     ORDER BY g.full_name ASC`,
    [meetingId]
  );
}

export async function getGuestVisitorById(id: string): Promise<GuestVisitor | null> {
  return queryOne<GuestVisitor>(
    `SELECT id, group_id, full_name, phone, created_at FROM guest_visitors WHERE id = $1`,
    [id]
  );
}

/**
 * Salva presenças de uma reunião (membros + visitantes não cadastrados)
 */
export async function saveAttendance(
  meetingId: string,
  attendance: Array<{ member_id: string; is_present: boolean }>,
  options: {
    groupId: string;
    guests?: Array<{ full_name: string; phone?: string | null }>;
    /**
     * Se true, só grava linhas de membros que já estavam no grupo na data do encontro.
     * Se false (padrão), grava o que o líder marcar — necessário para retroativos e encontros antigos.
     */
    restrictToMembersBeforeMeetingDate?: boolean;
  } = { groupId: '' }
): Promise<void> {
  const { groupId, guests = [], restrictToMembersBeforeMeetingDate = false } = options;

  await transaction(async (client) => {
    const meetingRow = await client.query<{ meeting_date: string }>(
      `SELECT meeting_date::text AS meeting_date FROM meetings WHERE id = $1`,
      [meetingId]
    );
    const meetingDate = meetingRow.rows[0]?.meeting_date;
    /** null = não filtrar; Set = só esses membros */
    let eligibleMemberIds: Set<string> | null = null;
    if (restrictToMembersBeforeMeetingDate && meetingDate && attendance.length > 0) {
      const ids = attendance.map((a) => a.member_id);
      const elig = await client.query<{ id: string }>(
        `SELECT id FROM members
         WHERE id = ANY($1::uuid[])
           AND group_id = $2
           AND (created_at AT TIME ZONE 'UTC')::date <= $3::date`,
        [ids, groupId, meetingDate]
      );
      eligibleMemberIds = new Set(elig.rows.map((r) => r.id));
    }

    // Remover presenças existentes (membros)
    await client.query(
      `DELETE FROM attendance WHERE meeting_id = $1`,
      [meetingId]
    );

    // Remover visitantes do encontro
    await client.query(
      `DELETE FROM attendance_guests WHERE meeting_id = $1`,
      [meetingId]
    );

    // Inserir presenças dos membros (só quem já pertencia ao grupo na data do encontro)
    for (const item of attendance) {
      if (eligibleMemberIds !== null && !eligibleMemberIds.has(item.member_id)) continue;
      await client.query(
        `INSERT INTO attendance (meeting_id, member_id, is_present)
         VALUES ($1, $2, $3)
         ON CONFLICT (meeting_id, member_id)
         DO UPDATE SET is_present = EXCLUDED.is_present`,
        [meetingId, item.member_id, item.is_present]
      );
    }

    // Inserir visitantes não cadastrados: criar ou reutilizar guest e vincular ao encontro
    const guestsToConvert: Array<{ id: string; full_name: string; phone: string | null }> = [];
    
    for (const g of guests) {
      const name = (g.full_name || '').trim();
      if (!name) continue;
      const phone = (g.phone || '').trim() || null;

      let guestId: string;
      const existing = await client.query(
        `SELECT id FROM guest_visitors WHERE group_id = $1 AND LOWER(TRIM(full_name)) = LOWER($2) AND COALESCE(TRIM(phone), '') = COALESCE($3, '') LIMIT 1`,
        [groupId, name, phone || '']
      );
      if (existing.rows.length > 0) {
        guestId = existing.rows[0].id;
        
        // Verificar quantas vezes este guest já apareceu
        const appearancesResult = await client.query<{ count: string }>(
          `SELECT COUNT(DISTINCT meeting_id)::text as count 
           FROM attendance_guests 
           WHERE guest_id = $1`,
          [guestId]
        );
        const appearances = parseInt(appearancesResult.rows[0]?.count || '0', 10);
        
        // Se já apareceu 1 vez antes (agora é a segunda), marcar para conversão
        if (appearances >= 1) {
          guestsToConvert.push({ id: guestId, full_name: name, phone });
        }
      } else {
        const insert = await client.query(
          `INSERT INTO guest_visitors (group_id, full_name, phone) VALUES ($1, $2, $3) RETURNING id`,
          [groupId, name, phone]
        );
        guestId = insert.rows[0].id;
      }
      await client.query(
        `INSERT INTO attendance_guests (meeting_id, guest_id) VALUES ($1, $2) ON CONFLICT (meeting_id, guest_id) DO NOTHING`,
        [meetingId, guestId]
      );
    }

    // Converter automaticamente guests recorrentes em membros com estágio "retornou"
    for (const guest of guestsToConvert) {
      // Verificar se já existe um membro com o mesmo nome
      const existingMember = await client.query(
        `SELECT id FROM members 
         WHERE group_id = $1 
         AND LOWER(TRIM(full_name)) = LOWER($2) 
         AND is_active = TRUE
         LIMIT 1`,
        [groupId, guest.full_name]
      );
      
      // Só converter se ainda não existe membro cadastrado
      if (existingMember.rows.length === 0) {
        await client.query(
          `INSERT INTO members (group_id, full_name, phone, birth_date, member_type, integration_stage)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [groupId, guest.full_name, guest.phone || '', null, 'visitor', 'retornou']
        );
        
        // Remover o guest_visitor já que foi convertido
        await client.query(
          `DELETE FROM attendance_guests WHERE guest_id = $1`,
          [guest.id]
        );
        await client.query(
          `DELETE FROM guest_visitors WHERE id = $1`,
          [guest.id]
        );
      }
    }
  });
}

// ============================================
// QUERIES DE NOTIFICAÇÕES
// ============================================

/**
 * Busca notificações não lidas do grupo do líder
 */
export async function getUnreadNotifications(): Promise<Notification[]> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return [];
  }

  return queryMany<Notification>(
    `SELECT * FROM notifications 
     WHERE group_id = $1 AND is_read = FALSE
     ORDER BY created_at DESC`,
    [leader.group_id]
  );
}

/**
 * Busca todas as notificações do grupo (lidas e não lidas), com limite
 */
export async function getAllNotifications(limit = 50): Promise<Notification[]> {
  const leader = await getCurrentLeader();

  if (!leader?.group_id) {
    return [];
  }

  return queryMany<Notification>(
    `SELECT * FROM notifications
     WHERE group_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leader.group_id, limit]
  );
}

/**
 * Marca notificação como lida
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  await query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1`,
    [notificationId]
  );
}

// ============================================
// QUERIES DE ESTATÍSTICAS
// ============================================

/**
 * Busca estatísticas do grupo do líder
 */
export async function getGroupStats(): Promise<{
  totalMembers: number;
  participants: number;
  visitors: number;
  upcomingMeetings: number;
  unreadNotifications: number;
}> {
  const leader = await getCurrentLeader();
  
  if (!leader?.group_id) {
    return {
      totalMembers: 0,
      participants: 0,
      visitors: 0,
      upcomingMeetings: 0,
      unreadNotifications: 0,
    };
  }

  const [membersResult, meetingsResult, notificationsResult] = await Promise.all([
    query<{ count: string; member_type: string }>(
      `SELECT COUNT(*)::int as count, member_type 
       FROM members 
       WHERE group_id = $1 AND is_active = TRUE
       GROUP BY member_type`,
      [leader.group_id]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int as count 
       FROM meetings 
       WHERE group_id = $1 
       AND meeting_date >= CURRENT_DATE
       AND is_cancelled = FALSE`,
      [leader.group_id]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int as count 
       FROM notifications 
       WHERE group_id = $1 AND is_read = FALSE`,
      [leader.group_id]
    ),
  ]);

  const participants = membersResult.rows.find(r => r.member_type === 'participant')?.count || '0';
  const visitors = membersResult.rows.find(r => r.member_type === 'visitor')?.count || '0';

  return {
    totalMembers: parseInt(participants) + parseInt(visitors),
    participants: parseInt(participants),
    visitors: parseInt(visitors),
    upcomingMeetings: parseInt(meetingsResult.rows[0]?.count || '0'),
    unreadNotifications: parseInt(notificationsResult.rows[0]?.count || '0'),
  };
}
