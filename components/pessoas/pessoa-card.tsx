'use client';

import { useState, type MouseEvent } from 'react';
import { WhatsAppButton } from './whatsapp-button';
import { LinkButton } from '@/components/ui/link-button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { calculateAge, formatPhone, isTodayBirthday } from '@/lib/utils';
import { MEMBER_TYPE_LABELS, INTEGRATION_STAGE_LABELS, INTEGRATION_STAGE_COLORS, VISITOR_STATUS_COLORS, VISITOR_STATUS_LABELS } from '@/lib/constants';
import { Pencil, Cake, AlertTriangle, CalendarCheck, Tags } from 'lucide-react';
import { DeleteMemberButton } from './delete-member-button';
import { cn } from '@/lib/utils';
import { MemberAttendanceStats } from './member-attendance-stats';
import { MemberTagsDialog } from './member-tags-dialog';
import { Checkbox } from '@/components/ui/checkbox';

type AttendanceStatus = 'present' | 'absent' | 'at-risk';

interface Member {
  id: string;
  full_name: string;
  phone: string;
  birth_date: string | null;
  member_type: 'participant' | 'visitor';
  integration_stage?: string | null;
  /** Nomes dos membros que este discipula (label "Discipulador de X, Y"). */
  discipulador_de?: string[] | null;
}

interface PessoaCardProps {
  member: Member;
  attendanceStatus?: AttendanceStatus;
  canDelete?: boolean;
  /** Modo seleção em massa na lista /pessoas */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (memberId: string) => void;
  onTagsChanged?: () => void;
}

const attendanceConfig: Record<
  AttendanceStatus,
  { label: string; dotClass: string; badgeClass: string; icon?: React.ReactNode }
> = {
  present: {
    label: 'Presente',
    dotClass: 'bg-status-present',
    badgeClass: 'bg-status-present/10 text-status-present border-status-present/20',
  },
  absent: {
    label: 'Ausente',
    dotClass: 'bg-status-absent',
    badgeClass: 'bg-status-absent/10 text-status-absent border-status-absent/20',
  },
  'at-risk': {
    label: 'Em Risco',
    dotClass: 'bg-status-risk animate-pulse',
    badgeClass: 'bg-status-risk/10 text-status-risk border-status-risk/20',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

export function PessoaCard({
  member,
  attendanceStatus,
  canDelete,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onTagsChanged,
}: PessoaCardProps) {
  const [showPresenca, setShowPresenca] = useState(false);
  const [showTags, setShowTags] = useState(false);

  let age: number | null = null;
  if (member.birth_date) {
    try {
      age = calculateAge(member.birth_date);
    } catch {
      age = null;
    }
  }
  const isBirthday = isTodayBirthday(member.birth_date);
  const attendance = attendanceStatus ? attendanceConfig[attendanceStatus] : null;

  return (
    <>
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          {selectionMode && (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelect?.(member.id)}
              className="mt-1 shrink-0"
              aria-label={`Selecionar ${member.full_name}`}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight mb-2 truncate">
              {member.full_name}
              {isBirthday && <Cake className="inline-block ml-2 h-4 w-4 text-amber-500" />}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={member.member_type === 'participant' ? 'default' : 'secondary'}
              >
                {MEMBER_TYPE_LABELS[member.member_type as keyof typeof MEMBER_TYPE_LABELS] ?? member.member_type ?? 'Membro'}
              </Badge>
              {member.member_type === 'visitor' && member.integration_stage && member.integration_stage !== 'membro' && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    INTEGRATION_STAGE_COLORS[member.integration_stage] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                  )}
                >
                  {INTEGRATION_STAGE_LABELS[member.integration_stage] ?? member.integration_stage}
                </span>
              )}
              {member.member_type === 'visitor' && member.marked_not_returned && (
                <span
                  className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    VISITOR_STATUS_COLORS.not_returned
                  )}
                >
                  {VISITOR_STATUS_LABELS.not_returned}
                </span>
              )}
              {(member.discipulador_de?.length ?? 0) > 0 && (
                <Badge variant="outline" className="font-normal">
                  Discipulador de {member.discipulador_de!.join(', ')}
                </Badge>
              )}
              {attendance && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
                    attendance.badgeClass
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', attendance.dotClass)} />
                  {attendance.icon}
                  {attendance.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground mb-4">
          <p>{member.phone ? formatPhone(String(member.phone)) : '-'}</p>
          {age !== null && <p>{age} anos</p>}
          {isBirthday && (
            <p className="text-amber-600 font-medium">🎂 Aniversariante do dia!</p>
          )}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex flex-wrap gap-2">
        <WhatsAppButton phone={member.phone} name={member.full_name} className="flex-1 min-w-0" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-0"
          onClick={() => setShowPresenca(true)}
        >
          <CalendarCheck className="h-4 w-4 shrink-0" />
          Ver presença
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 min-w-0"
          onClick={() => setShowTags(true)}
        >
          <Tags className="h-4 w-4 shrink-0" />
          Tags
        </Button>
        <LinkButton href={`/pessoas/${member.id}`} variant="outline" size="sm" className="flex-1 min-w-0">
          <Pencil className="h-4 w-4" />
          Editar
        </LinkButton>
        {canDelete && (
          <DeleteMemberButton
            memberId={member.id}
            memberName={member.full_name}
            canDelete
            variant="icon"
            className="shrink-0"
          />
        )}
      </CardFooter>
    </Card>

    <Dialog open={showPresenca} onOpenChange={setShowPresenca}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Presença — {member.full_name}
          </DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <MemberAttendanceStats memberId={member.id} embedded />
        </div>
      </DialogContent>
    </Dialog>

    <MemberTagsDialog
      open={showTags}
      onOpenChange={setShowTags}
      memberId={member.id}
      memberName={member.full_name}
      onTagsChanged={onTagsChanged}
    />
    </>
  );
}
