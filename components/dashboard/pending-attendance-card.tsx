import Link from 'next/link';
import { ClipboardCheck, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  formatMeetingDate,
  PENDING_ATTENDANCE_DAYS,
  whatsappReminderLink,
  type PendingAttendanceMeeting,
} from '@/lib/attendance-pending';

/**
 * Encontros sem chamada lançada.
 * variant="leader": botão para lançar. variant="coordinator": grupo, líder e WhatsApp.
 */
export function PendingAttendanceCard({
  items,
  variant,
}: {
  items: PendingAttendanceMeeting[];
  variant: 'leader' | 'coordinator';
}) {
  if (items.length === 0) return null;
  const isLeader = variant === 'leader';

  return (
    <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5 text-amber-600" />
          {isLeader
            ? items.length === 1
              ? 'Chamada pendente'
              : `${items.length} chamadas pendentes`
            : `Grupos sem chamada lançada (${items.length})`}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Encontros dos últimos {PENDING_ATTENDANCE_DAYS} dias sem presença registrada.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((p) => {
            const wa = isLeader ? null : whatsappReminderLink(p);
            return (
              <li key={p.meeting_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {isLeader ? p.title || 'Encontro' : p.group_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMeetingDate(p.meeting_date)}
                    {!isLeader && p.leader_name ? ` · Líder: ${p.leader_name}` : ''}
                  </p>
                </div>
                {isLeader ? (
                  <Link
                    href={`/chamada?meeting=${p.meeting_id}`}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Lançar chamada
                  </Link>
                ) : wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                    Lembrar líder
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">sem telefone</span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
