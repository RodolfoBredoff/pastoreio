'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertCircle, Cake, Check, CalendarDays, Users, MessageCircle, UserX, Bell,
} from 'lucide-react';
import { NOTIFICATION_TYPES } from '@/lib/constants';
import { formatDate, isTodayBirthday } from '@/lib/utils';

type PresenceFilter = 'absent' | 'present';
type MemberTypeFilter = 'total' | 'participants' | 'visitors';
type AbsentMetricMode = 'most_absent' | 'consecutive' | 'month';

/** Janela de encontros: 'all' ou um número inteiro positivo. */
type ScopeMode = 'all' | 'custom';

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

interface AlertasPanelFullProps {
  notifications: Notification[];
  upcomingMeetings: UpcomingMeeting[];
  upcomingBirthdays: UpcomingBirthday[];
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

function buildPresentWhatsAppLink(phone: string | null, name: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0];
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(
    `Olá ${firstName}! Agradecemos sua presença no nosso último encontro. Que Deus continue abençoando você! 💙`
  )}`;
}

const BIRTHDAY_MESSAGES = [
  (name: string) => `🎉 Feliz aniversário, ${name}! Que este dia seja repleto de alegria e bênçãos. Que Deus continue abençoando sua vida! 🙏✨`,
  (name: string) => `🎂 Parabéns, ${name}! Hoje é um dia especial para celebrar você. Desejamos muita felicidade e que todos os seus sonhos se realizem! 💙🎈`,
  (name: string) => `🎊 ${name}, feliz aniversário! Que este novo ano de vida seja marcado pela presença de Deus e por momentos inesquecíveis. Abraços! 🙌❤️`,
  (name: string) => `🎁 Parabéns pelo seu dia, ${name}! Que você seja cercado de pessoas queridas e que este novo ciclo traga muitas conquistas. Deus te abençoe! 🌟`,
  (name: string) => `🎈 Feliz aniversário, ${name}! Hoje celebramos você e toda a alegria que você traz para nossas vidas. Que este dia seja especial! 💐🎉`,
];

function buildBirthdayWhatsAppLink(phone: string | null, name: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  const firstName = name.split(' ')[0];
  const msgFn = BIRTHDAY_MESSAGES[Math.floor(Math.random() * BIRTHDAY_MESSAGES.length)];
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(msgFn(firstName))}`;
}

export function AlertasPanelFull({
  notifications: initialNotifications,
  upcomingMeetings,
  upcomingBirthdays,
}: AlertasPanelFullProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [showAllNotifications, setShowAllNotifications] = useState(false);
  const [absentMembers, setAbsentMembers] = useState<AbsentMember[]>([]);
  const [loading, setLoading] = useState(false);

  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>('absent');
  const [memberTypeFilter, setMemberTypeFilter] = useState<MemberTypeFilter>('total');
  const [absentMetricMode, setAbsentMetricMode] = useState<AbsentMetricMode>('most_absent');
  const [absentYearMonth, setAbsentYearMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Janela customizável
  const [scopeMode, setScopeMode] = useState<ScopeMode>('custom');
  const [customN, setCustomN] = useState(10);
  const [customInput, setCustomInput] = useState('10');

  const scopeParam =
    scopeMode === 'all' ? 'all' : `last${Math.max(1, customN)}`;

  function scopeLabel(): string {
    if (scopeMode === 'all') return 'todos os encontros';
    return `últimos ${customN} encontro${customN !== 1 ? 's' : ''}`;
  }

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      presence: presenceFilter,
      member_filter: memberTypeFilter,
      limit: '100',
    });

    if (presenceFilter === 'absent') {
      if (absentMetricMode === 'most_absent') {
        params.set('mode', 'most_absent');
        params.set('scope', scopeParam);
      } else if (absentMetricMode === 'month') {
        params.set('mode', 'month');
        params.set('year_month', absentYearMonth);
      } else {
        params.set('mode', 'consecutive');
        params.set('scope', scopeParam);
      }
    }

    fetch(`/api/members/absent?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AbsentMember[]) => setAbsentMembers(data))
      .catch(() => setAbsentMembers([]))
      .finally(() => setLoading(false));
  }, [presenceFilter, memberTypeFilter, absentMetricMode, absentYearMonth, scopeParam]);

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, { method: 'PUT' });
      if (!response.ok) throw new Error('Erro ao marcar notificação como lida');
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayedNotifications = showAllNotifications
    ? notifications
    : notifications.filter((n) => !n.is_read);

  return (
    <div className="space-y-6">
      {/* Próximos encontros */}
      {upcomingMeetings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Próximos Encontros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingMeetings.map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background"
              >
                <div>
                  {meeting.title && <p className="text-sm font-medium">{meeting.title}</p>}
                  <p className={`text-sm ${meeting.title ? 'text-muted-foreground' : 'font-medium'}`}>
                    {formatDate(meeting.meeting_date)}
                  </p>
                  {meeting.meeting_time && (
                    <p className="text-xs text-muted-foreground">{meeting.meeting_time.substring(0, 5)}</p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  Confirmado
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Faltantes / Presentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserX className="h-4 w-4 text-muted-foreground" />
            Faltantes / Presentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtro: Exibir */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground w-14 shrink-0">Exibir:</span>
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
          </div>

          {/* Filtro: Tipo */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground w-14 shrink-0">Tipo:</span>
            <div className="flex gap-1 flex-wrap">
              {(['total', 'participants', 'visitors'] as MemberTypeFilter[]).map((t) => (
                <Button
                  key={t}
                  variant={memberTypeFilter === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMemberTypeFilter(t)}
                >
                  {t === 'total' ? 'Todos' : t === 'participants' ? 'Participantes' : 'Visitantes'}
                </Button>
              ))}
            </div>
          </div>

          {/* Filtro: Critério (só faltantes) */}
          {presenceFilter === 'absent' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground w-14 shrink-0">Critério:</span>
              <div className="flex gap-1 flex-wrap">
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

          {/* Filtro: Janela — customizável */}
          {presenceFilter === 'absent' && absentMetricMode !== 'month' && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground w-14 shrink-0">Janela:</span>
              <div className="flex gap-1 flex-wrap items-center">
                <Button
                  variant={scopeMode === 'all' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setScopeMode('all')}
                >
                  Todos os encontros
                </Button>
                <Button
                  variant={scopeMode === 'custom' ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setScopeMode('custom')}
                >
                  Personalizado
                </Button>
                {scopeMode === 'custom' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">Últimos</span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={customInput}
                      onChange={(e) => {
                        setCustomInput(e.target.value);
                        const n = parseInt(e.target.value, 10);
                        if (Number.isFinite(n) && n >= 1) setCustomN(n);
                      }}
                      onBlur={() => {
                        const n = parseInt(customInput, 10);
                        const safe = Number.isFinite(n) && n >= 1 ? n : 10;
                        setCustomN(safe);
                        setCustomInput(String(safe));
                      }}
                      className="w-16 border rounded-md px-2 py-1 text-sm bg-background text-center"
                    />
                    <span className="text-sm text-muted-foreground">encontros</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resultados */}
          {loading ? (
            <p className="text-sm text-muted-foreground py-2">Carregando...</p>
          ) : absentMembers.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {absentMembers.length}{' '}
                {presenceFilter === 'absent' ? 'faltante' : 'presente'}
                {absentMembers.length !== 1 ? 's' : ''}
                {memberTypeFilter !== 'total'
                  ? ` (${memberTypeFilter === 'participants' ? 'participantes' : 'visitantes'})`
                  : ''}
                {presenceFilter === 'absent' && absentMetricMode !== 'month'
                  ? ` — ${scopeLabel()}`
                  : ''}
              </p>
              {absentMembers.map((member) => {
                const firstName = member.full_name.split(' ')[0];
                const waLink =
                  presenceFilter === 'absent'
                    ? buildWhatsAppLink(member.phone, firstName, member.consecutive_absences ?? 0)
                    : buildPresentWhatsAppLink(member.phone, member.full_name);
                const isPresent = presenceFilter === 'present';
                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isPresent ? 'bg-green-50/50 border-green-100' : 'bg-red-50/50 border-red-100'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{member.full_name}</p>
                      {!isPresent && (member.consecutive_absences ?? 0) > 0 && (
                        <p className="text-xs text-red-600 font-medium">
                          {member.consecutive_absences} falta
                          {member.consecutive_absences !== 1 ? 's' : ''}
                          {absentMetricMode === 'consecutive'
                            ? ` seguida${member.consecutive_absences !== 1 ? 's' : ''} (${scopeLabel()})`
                            : absentMetricMode === 'month'
                            ? ` no mês ${absentYearMonth.split('-').reverse().join('/')}`
                            : ` no período (${scopeLabel()})`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge
                        variant={member.member_type === 'participant' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {member.member_type === 'participant' ? 'Participante' : 'Visitante'}
                      </Badge>
                      {waLink && (
                        <a href={waLink} target="_blank" rel="noopener noreferrer">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Enviar mensagem no WhatsApp"
                          >
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
              {memberTypeFilter !== 'total'
                ? ` (${memberTypeFilter === 'participants' ? 'participantes' : 'visitantes'})`
                : ''}{' '}
              no momento.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Próximos aniversariantes */}
      {upcomingBirthdays.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-4 w-4 text-muted-foreground" />
              Próximos Aniversariantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingBirthdays.map((person) => {
              const isToday = isTodayBirthday(person.birth_date);
              const waLink = buildBirthdayWhatsAppLink(person.phone, person.full_name);
              return (
                <div
                  key={person.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    isToday ? 'bg-yellow-50 border-yellow-200' : 'bg-background'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Cake
                      className={`h-4 w-4 shrink-0 ${
                        isToday ? 'text-yellow-500' : 'text-muted-foreground'
                      }`}
                    />
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
                    <Badge
                      variant={person.member_type === 'participant' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {person.member_type === 'participant' ? 'Participante' : 'Visitante'}
                    </Badge>
                    {waLink && (
                      <a href={waLink} target="_blank" rel="noopener noreferrer">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          title="Enviar mensagem de aniversário no WhatsApp"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Notificações do sistema (histórico completo) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Notificações
              {unreadCount > 0 && (
                <Badge variant="default" className="text-xs ml-1">
                  {unreadCount} nova{unreadCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </CardTitle>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setShowAllNotifications((v) => !v)}
              >
                {showAllNotifications
                  ? 'Mostrar apenas novas'
                  : `Ver histórico (${notifications.length})`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {displayedNotifications.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">
              {showAllNotifications
                ? 'Nenhuma notificação registrada.'
                : 'Nenhuma notificação não lida.'}
            </p>
          ) : (
            <div className="space-y-3">
              {displayedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${
                    !notification.is_read ? 'bg-accent' : 'bg-background'
                  }`}
                >
                  <div className="mt-0.5">
                    {notification.notification_type === NOTIFICATION_TYPES.ABSENCE_ALERT ? (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    ) : notification.notification_type === NOTIFICATION_TYPES.VISITOR_DROPOFF ? (
                      <UserX className="h-5 w-5 text-orange-500" />
                    ) : (
                      <Cake className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{notification.message}</p>
                      {!notification.is_read && (
                        <Badge variant="default" className="shrink-0">
                          Novo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markAsRead(notification.id)}
                        className="h-7 text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
