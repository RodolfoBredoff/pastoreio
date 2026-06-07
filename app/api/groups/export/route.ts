import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getCurrentLeader } from '@/lib/db/queries';
import { queryMany } from '@/lib/db/postgres';

/**
 * GET /api/groups/export
 * Exporta os dados do grupo do líder autenticado em formato CSV.
 * Inclui membros, visitantes e histórico de presença resumido.
 * Conformidade LGPD: exportação de dados do próprio grupo.
 */
export async function GET() {
  try {
    await requireAuth();
    const leader = await getCurrentLeader();

    if (!leader?.group_id) {
      return NextResponse.json(
        { error: 'Líder não está vinculado a um grupo' },
        { status: 400 }
      );
    }

    const groupId = leader.group_id;

    // Membros e visitantes
    const members = await queryMany<{
      full_name: string;
      phone: string | null;
      birth_date: string | null;
      member_type: string;
      integration_stage: string;
      is_active: boolean;
      created_at: string;
      total_presences: string;
      total_meetings: string;
    }>(
      `SELECT
         m.full_name,
         m.phone,
         m.birth_date,
         m.member_type,
         m.integration_stage,
         m.is_active,
         m.created_at,
         COUNT(a.id) FILTER (WHERE a.is_present = TRUE) AS total_presences,
         COUNT(a.id) AS total_meetings
       FROM members m
       LEFT JOIN attendance a ON a.member_id = m.id
       WHERE m.group_id = $1 AND m.excluded_at IS NULL
       GROUP BY m.id
       ORDER BY m.member_type ASC, m.full_name ASC`,
      [groupId]
    );

    // Gerar CSV
    const header = [
      'Nome',
      'Telefone',
      'Data de Nascimento',
      'Tipo',
      'Estágio de Integração',
      'Ativo',
      'Cadastrado em',
      'Total de Presenças',
      'Total de Encontros Registrados',
      'Taxa de Presença (%)',
    ].join(',');

    const MEMBER_TYPE_LABELS: Record<string, string> = {
      participant: 'Membro',
      visitor: 'Visitante',
    };

    const STAGE_LABELS: Record<string, string> = {
      novo_visitante: 'Novo Visitante',
      retornou: 'Retornou',
      integrando: 'Em Integração',
      membro: 'Membro',
    };

    function escapeCsv(val: string | null | undefined): string {
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    function formatDate(val: string | null): string {
      if (!val) return '';
      const d = val.split('T')[0];
      const [y, m, day] = d.split('-');
      return y === '1900' ? `${day}/${m}` : `${day}/${m}/${y}`;
    }

    const rows = members.map((m) => {
      const presences = parseInt(m.total_presences ?? '0');
      const total = parseInt(m.total_meetings ?? '0');
      const rate = total > 0 ? Math.round((presences / total) * 100) : 0;

      return [
        escapeCsv(m.full_name),
        escapeCsv(m.phone),
        escapeCsv(formatDate(m.birth_date)),
        escapeCsv(MEMBER_TYPE_LABELS[m.member_type] ?? m.member_type),
        escapeCsv(m.member_type === 'participant' ? '' : (STAGE_LABELS[m.integration_stage] ?? m.integration_stage)),
        m.is_active ? 'Sim' : 'Não',
        escapeCsv(formatDate(m.created_at)),
        String(presences),
        String(total),
        String(rate),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    const BOM = '\uFEFF'; // UTF-8 BOM para compatibilidade com Excel
    const csvWithBom = BOM + csv;

    const date = new Date().toISOString().split('T')[0];
    const filename = `grupo-export-${date}.csv`;

    return new Response(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Erro ao exportar dados do grupo:', error);
    return NextResponse.json(
      { error: 'Erro ao exportar dados' },
      { status: 500 }
    );
  }
}
