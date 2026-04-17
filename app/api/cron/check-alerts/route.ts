import { NextResponse } from 'next/server';
import { runAllChecks, checkMeetingReminders, checkWeeklySummary } from '@/lib/alerts/checker';

/**
 * GET /api/cron/check-alerts
 * Rota chamada diariamente por um cron externo (GitHub Actions, AWS EventBridge, etc.).
 * Protegida pelo header Authorization: Bearer <CRON_SECRET>.
 *
 * Exemplo de chamada via curl:
 *   curl -H "Authorization: Bearer SEU_CRON_SECRET" https://seudominio.com/api/cron/check-alerts
 *
 * Variável de ambiente necessária: CRON_SECRET
 */
export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.replace('Bearer ', '');
      if (token !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const result = await runAllChecks();

    // Lembretes pré-encontro (diário)
    const remindersSent = await checkMeetingReminders();

    // Resumo semanal somente às segundas-feiras
    const dayOfWeek = new Date().getDay(); // 1 = segunda
    let weeklySummary = 0;
    if (dayOfWeek === 1) {
      weeklySummary = await checkWeeklySummary();
    }

    return NextResponse.json({
      ok: true,
      absenceAlerts: result.absenceAlerts,
      birthdayNotifications: result.birthdayNotifications,
      visitorDropoffs: result.visitorDropoffs,
      remindersSent,
      weeklySummary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Erro no cron de alertas:', error);
    return NextResponse.json(
      { error: 'Erro ao executar verificações' },
      { status: 500 }
    );
  }
}
