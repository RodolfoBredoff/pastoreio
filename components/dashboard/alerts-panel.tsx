'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Cake, Check, CalendarDays, Users, MessageCircle, UserX } from 'lucide-react';
import { NOTIFICATION_TYPES } from '@/lib/constants';
import { formatDate, isTodayBirthday } from '@/lib/utils';

type PresenceFilter = 'absent' | 'present';
type MemberTypeFilter = 'total' | 'participants' | 'visitors';
/** Critério ao listar faltantes (presentes usam só o último encontro). */
type AbsentMetricMode = 'most_absent' | 'consecutive' | 'month';
/** Janela de encontros para most_absent e consecutive (API: scope=all | last10 | last5). */
type AbsentScope = 'all' | 'last10' | 'last5';

function scopeLabel(s: AbsentScope): string {
  if (s === 'all') return 'todos os encontros';
  if (s === 'last5') return 'últimos 5 encontros';
  return 'últimos 10 encontros';
}

interface Notification {
  id: string;
  notification_type: 'absence_alert' | 'birthday' | 'visitor_dropoff';
  message: string;
  is_read: boolean;
  created_at: string;
}

interface UpcomingMeeting {
  id: string;
  meeting_date: string;
  title: string | null;
  meeting_time: string | null;
}

interface UpcomingBirthday {
  id: string;
  full_name: string;
  birth_date: string;
  member_type: string;
  phone: string | null;
}

interface AbsentMember {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: 'participant' | 'visitor';
  consecutive_absences: number;
}

interface AlertsPanelProps {
  notifications: Notification[];
  upcomingMeetings?: UpcomingMeeting[];
  upcomingBirthdays?: UpcomingBirthday[];
}

function buildWhatsAppLink(phone: string | null, name: string, absences: number): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const message = encodeURIComponent(
    `Olá ${name}! Estamos sentindo sua falta nos nossos encontros. Já faz ${absences} encontro${absences !== 1 ? 's' : ''} que você não aparece. Esperamos você em breve! 💙`
  );
  return `https://wa.me/${fullNumber}?text=${message}`;
}

const BIRTHDAY_MESSAGES = [
  (name: string) => `🎉 Feliz aniversário, ${name}! Que este dia seja repleto de alegria e bênçãos. Que Deus continue abençoando sua vida! 🙏✨`,
  (name: string) => `🎂 Parabéns, ${name}! Hoje é um dia especial para celebrar você. Desejamos muita felicidade e que todos os seus sonhos se realizem! 💙🎈`,
  (name: string) => `🎊 ${name}, feliz aniversário! Que este novo ano de vida seja marcado pela presença de Deus e por momentos inesquecíveis. Abraços! 🙌❤️`,
  (name: string) => `🎁 Parabéns pelo seu dia, ${name}! Que você seja cercado de pessoas queridas e que este novo ciclo traga muitas conquistas. Deus te abençoe! 🌟`,
  (name: string) => `🎈 Feliz aniversário, ${name}! Hoje celebramos você e toda a alegria que você traz para nossas vidas. Que este dia seja especial! 💐🎉`,
  (name: string) => `🎊 ${name}, parabéns! Que este novo ano seja repleto de saúde, paz e realizações. Estamos felizes por ter você conosco! 🙏💙`,
  (name: string) => `🎂 Hoje é seu dia especial, ${name}! Desejamos que você seja muito feliz e que todos os seus planos se realizem. Feliz aniversário! ✨🎈`,
  (name: string) => `🎉 Parabéns, ${name}! Que Deus continue abençoando sua vida e que você tenha muitos motivos para sorrir hoje e sempre! 🙌❤️`,
];

function buildPresentWhatsAppLink(phone: string | null, name: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0];
  const message = encodeURIComponent(
    `Olá ${firstName}! Agradecemos sua presença no nosso último encontro. Que Deus continue abençoando você! 💙`
  );
  return `https://wa.me/${fullNumber}?text=${message}`;
}

function buildBirthdayWhatsAppLink(phone: string | null, name: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0];
  const randomMessage = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)](firstName);
  const message = encodeURIComponent(randomMessage);
  return `https://wa.me/${fullNumber}?text=${message}`;
}

export function AlertsPanel({
  notifications: initialNotifications,
  upcomingMeetings = [],
  upcomingBirthdays = [],
}: AlertsPanelProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [absentMembers, setAbsentMembers] = useState<AbsentMember[]>([]);
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('absent');
  const [memberTypeFilter, setMemberTypeFilter] = useState<MemberTypeFilter>('total');
  const [absentMetricMode, setAbsentMetricMode] = useState<AbsentMetricMode>('most_absent');
  const [absentYearMonth, setAbsentYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [absentScope, setAbsentScope] = useState<AbsentScope>('all');

  useEffect(() => {
    const params = new URLSearchParams({
      presence: presenceFilter,
      member_filter: memberTypeFilter,
      limit: '80',
    });
    if (presenceFilter === 'absent') {
      if (absentMetricMode === 'most_absent') {
        params.set('mode', 'most_absent');
        params.set(
          'scope',
          absentScope === 'all' ? 'all' : absentScope === 'last5' ? 'last5' : 'last10'
        );
      } else if (absentMetricMode === 'month') {
        params.set('mode', 'month');
        params.set('year_month', absentYearMonth);
      } else {
        params.set('mode', 'consecutive');
        params.set(
          'scope',
          absentScope === 'all' ? 'all' : absentScope === 'last5' ? 'last5' : 'last10'
        );
      }
    }
    fetch(`/api/members/absent?${params}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: AbsentMember[]) => setAbsentMembers(data))
      .catch(() => {});
  }, [presenceFilter, memberTypeFilter, absentMetricMode, absentYearMonth, absentScope]);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: 'PUT' });
      if (!response.ok) throw new Error('Erro ao marcar notificação como lida');
      setNotifications((prev) =>
        prev.map((notif) => notif.id === notificationId ? { ...notif, is_read: true } : notif)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const hasContent =
    notifications.length > 0 ||
    upcomingMeetings.length > 0 ||
    upcomingBirthdays.length > 0 ||
    absentMembers.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas e Notificações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasContent && (
          <p className="text-sm text-muted-foreground">Nenhuma notificação no momento.</p>
        )}

        {/* Próximos encontros */}
        {upcomingMeetings.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <CalendarDays className="h-4 w-4" />
              Próximos Encontros
            </div>
            <div className="space-y-2">
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
                  <div>
                    {meeting.title && <p className="text-sm font-medium">{meeting.title}</p>}
                    <p className={`text-sm ${meeting.title ? 'text-muted-foreground' : 'font-medium'}`}>
                      {formatDate(meeting.meeting_date)}
                    </p>
                    {meeting.meeting_time && (
                      <p className="text-xs text-muted-foreground">{meeting.meeting_time.substring(0, 5)}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">Confirmado</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Faltantes / Presentes com filtro por tipo */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            <UserX className="h-4 w-4" />
            Faltantes / Presentes
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground self-center">Exibir:</span>
            <div className="flex gap-1">
              <Button
                variant={presenceFilter === 'absent' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPresenceFilter('absent')}
              >
                Faltantes
              </Button>
              <Button
                variant={presenceFilter === 'present' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPresenceFilter('present')}
              >
                Presentes
              </Button>
            </div>
            <span className="text-sm text-muted-foreground self-center ml-2">Tipo:</span>
            <div className="flex gap-1">
              <Button
                variant={memberTypeFilter === 'total' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMemberTypeFilter('total')}
              >
                Todos
              </Button>
              <Button
                variant={memberTypeFilter === 'participants' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMemberTypeFilter('participants')}
              >
                Participantes
              </Button>
              <Button
                variant={memberTypeFilter === 'visitors' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMemberTypeFilter('visitors')}
              >
                Visitantes
              </Button>
            </div>
          </div>
          {presenceFilter === 'absent' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Critério:</span>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={absentMetricMode === 'most_absent' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentMetricMode('most_absent')}
                >
                  Mais faltantes
                </Button>
                <Button
                  variant={absentMetricMode === 'consecutive' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentMetricMode('consecutive')}
                >
                  Faltas seguidas
                </Button>
                <Button
                  variant={absentMetricMode === 'month' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentMetricMode('month')}
                >
                  Faltas no mês
                </Button>
              </div>
              {absentMetricMode === 'month' && (
                <input
                  type="month"
                  className="border rounded-md px-2 py-1 text-sm bg-background"
                  value={absentYearMonth}
                  onChange={(e) => setAbsentYearMonth(e.target.value)}
                />
              )}
            </div>
          )}
          {presenceFilter === 'absent' && absentMetricMode !== 'month' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Janela:</span>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant={absentScope === 'last5' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentScope('last5')}
                >
                  Últimos 5
                </Button>
                <Button
                  variant={absentScope === 'last10' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentScope('last10')}
                >
                  Últimos 10
                </Button>
                <Button
                  variant={absentScope === 'all' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setAbsentScope('all')}
                >
                  Todos os encontros
                </Button>
              </div>
            </div>
          )}
          {absentMembers.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {presenceFilter === 'absent' ? 'Faltantes' : 'Presentes'} ({memberTypeFilter === 'total' ? 'todos' : memberTypeFilter === 'participants' ? 'participantes' : 'visitantes'})
              </p>
              {absentMembers.map((member) => {
                const firstName = member.full_name.split(' ')[0];
                const waLink = presenceFilter === 'absent'
                  ? buildWhatsAppLink(member.phone, firstName, member.consecutive_absences ?? 0)
                  : buildPresentWhatsAppLink(member.phone, member.full_name);
                const isPresent = presenceFilter === 'present';
                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${isPresent ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{member.full_name}</p>
                      {!isPresent && (member.consecutive_absences ?? 0) > 0 && (
                        <p className="text-xs text-red-600 font-medium">
                          {member.consecutive_absences} falta{member.consecutive_absences !== 1 ? 's' : ''}
                          {absentMetricMode === 'consecutive'
                            ? ` seguida${member.consecutive_absences !== 1 ? 's' : ''} (${scopeLabel(absentScope)})`
                            : absentMetricMode === 'month'
                              ? ` no mês ${absentYearMonth.split('-').reverse().join('/')}`
                              : ` no período (${scopeLabel(absentScope)})`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant={member.member_type === 'participant' ? 'default' : 'secondary'} className="text-xs">
                        {member.member_type === 'participant' ? 'Participante' : 'Visitante'}
                      </Badge>
                      {waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" title="Enviar mensagem no WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Nenhum {presenceFilter === 'absent' ? 'faltante' : 'presente'}
              {memberTypeFilter !== 'total' ? ` (${memberTypeFilter === 'participants' ? 'participantes' : 'visitantes'})` : ''} no momento.
            </p>
          )}
        </div>

        {/* Próximos aniversariantes */}
        {upcomingBirthdays.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <Users className="h-4 w-4" />
              Próximos Aniversariantes
            </div>
            <div className="space-y-2">
              {upcomingBirthdays.map((person) => {
                const isToday = isTodayBirthday(person.birth_date);
                const waLink = buildBirthdayWhatsAppLink(person.phone, person.full_name);
                return (
                  <div key={person.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${isToday ? 'bg-yellow-50 border-yellow-200' : 'bg-background'}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Cake className={`h-4 w-4 shrink-0 ${isToday ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {person.full_name}
                          {isToday && <span className="ml-2 text-yellow-600">🎉 Hoje!</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {person.birth_date
                            ? (() => {
                                const parts = person.birth_date.split('T')[0].split('-');
                                return `${parts[2]}/${parts[1]}`;
                              })()
                            : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant={person.member_type === 'participant' ? 'default' : 'secondary'} className="text-xs">
                        {person.member_type === 'participant' ? 'Participante' : 'Visitante'}
                      </Badge>
                      {waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" title="Enviar mensagem de aniversário no WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notificações do sistema */}
        {notifications.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              <AlertCircle className="h-4 w-4" />
              Notificações
            </div>
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div key={notification.id}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${!notification.is_read ? 'bg-accent' : 'bg-background'}`}>
                  <div className="mt-0.5">
                    {notification.notification_type === NOTIFICATION_TYPES.ABSENCE_ALERT ? (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <Cake className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{notification.message}</p>
                      {!notification.is_read && <Badge variant="default" className="shrink-0">Novo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    {!notification.is_read && (
                      <Button variant="ghost" size="sm" onClick={() => markAsRead(notification.id)} className="h-7 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
