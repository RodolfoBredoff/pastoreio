export const MEMBER_TYPES = {
  PARTICIPANT: 'participant',
  VISITOR: 'visitor',
} as const;

export const MEMBER_TYPE_LABELS = {
  [MEMBER_TYPES.PARTICIPANT]: 'Participante',
  [MEMBER_TYPES.VISITOR]: 'Visitante',
};

export const NOTIFICATION_TYPES = {
  ABSENCE_ALERT: 'absence_alert',
  BIRTHDAY: 'birthday',
  VISITOR_DROPOFF: 'visitor_dropoff',
} as const;

export const NOTIFICATION_TYPE_LABELS = {
  [NOTIFICATION_TYPES.ABSENCE_ALERT]: 'Alerta de Faltas',
  [NOTIFICATION_TYPES.BIRTHDAY]: 'Aniversário',
  [NOTIFICATION_TYPES.VISITOR_DROPOFF]: 'Visitante Inativo',
};

export const INTEGRATION_STAGES = {
  NOVO_VISITANTE: 'novo_visitante',
  RETORNOU: 'retornou',
  INTEGRANDO: 'integrando',
  MEMBRO: 'membro',
} as const;

export const INTEGRATION_STAGE_LABELS: Record<string, string> = {
  novo_visitante: 'Novo Visitante',
  retornou: 'Retornou',
  integrando: 'Integrando',
  membro: 'Membro',
};

export const INTEGRATION_STAGE_COLORS: Record<string, string> = {
  novo_visitante: 'bg-slate-100 text-slate-700 border-slate-200',
  retornou: 'bg-blue-100 text-blue-700 border-blue-200',
  integrando: 'bg-amber-100 text-amber-700 border-amber-200',
  membro: 'bg-green-100 text-green-700 border-green-200',
};

export const VISITOR_STATUS_LABELS = {
  not_returned: 'Não Retornou',
  not_participated_year: 'Não Participou Este Ano',
} as const;

export const VISITOR_STATUS_COLORS = {
  not_returned: 'bg-red-100 text-red-700 border-red-200',
  not_participated_year: 'bg-orange-100 text-orange-700 border-orange-200',
} as const;

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

export const MAX_CONSECUTIVE_ABSENCES = 3;
