'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Calendar as CalendarIcon, Clock, Pencil, Settings, Ban, RotateCcw, PlusCircle, Star, CalendarPlus, Trash2, Users, Link2, ListChecks } from 'lucide-react';
import { formatDate, getDayOfWeekName } from '@/lib/utils';

// ============================================================
// Tipos
// ============================================================

interface Meeting {
  id: string;
  group_id: string;
  meeting_date: string;
  meeting_time: string | null;
  is_cancelled: boolean;
  title: string | null;
  notes: string | null;
  meeting_type: 'regular' | 'special_event';
  created_at: string;
  attendance_list_token?: string | null;
}

interface MeetingWithCount extends Meeting {
  attendanceCount: number;
}

interface GroupSettings {
  default_meeting_day: number;
  default_meeting_time: string;
}

interface Member {
  id: string;
  full_name: string;
}

interface AgendaClientProps {
  meetings: Meeting[];
  pastMeetings: MeetingWithCount[];
  group: GroupSettings;
  members?: Member[];
  readOnly?: boolean;
  canEdit?: boolean;
  canSettings?: boolean;
}

function toInputDate(val: string | Date | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val.split('T')[0];
  return val.toISOString().split('T')[0];
}

// ============================================================
// Dialog de edição de reunião
// ============================================================

function EditMeetingDialog({
  meeting,
  defaultTime,
  members,
  open,
  onOpenChange,
  onSave,
}: {
  meeting: Meeting;
  defaultTime: string;
  members: Member[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (updated?: Partial<Meeting>) => void;
}) {
  const [date, setDate] = useState(toInputDate(meeting.meeting_date));
  const [time, setTime] = useState(meeting.meeting_time ?? defaultTime);
  const [title, setTitle] = useState(meeting.title ?? '');
  const [notes, setNotes] = useState(meeting.notes ?? '');
  const [meetingType, setMeetingType] = useState<'regular' | 'special_event'>(meeting.meeting_type ?? 'regular');
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(toInputDate(meeting.meeting_date));
    setTime(meeting.meeting_time ?? defaultTime);
    setTitle(meeting.title ?? '');
    setNotes(meeting.notes ?? '');
    setMeetingType(meeting.meeting_type ?? 'regular');

    if (members.length > 0) {
      setLoadingAttendance(true);
      fetch(`/api/attendance?meeting_id=${meeting.id}`)
        .then((res) => res.ok ? res.json() : [])
        .then((data: Array<{ member_id: string; is_present: boolean }>) => {
          const map: Record<string, boolean> = {};
          for (const member of members) map[member.id] = false;
          for (const att of data) map[att.member_id] = att.is_present;
          setPresenceMap(map);
        })
        .catch(() => {
          const map: Record<string, boolean> = {};
          for (const member of members) map[member.id] = false;
          setPresenceMap(map);
        })
        .finally(() => setLoadingAttendance(false));
    }
  }, [open, meeting.id]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const togglePresence = (memberId: string) => {
    setPresenceMap((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const presentCount = Object.values(presenceMap).filter(Boolean).length;

  const handleSave = async () => {
    if (!date) { setError('A data é obrigatória'); return; }
    setError('');
    setLoading(true);
    try {
      const meetingRes = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: date,
          meeting_time: time || null,
          title: title || null,
          notes: notes || null,
          meeting_type: meetingType,
        }),
      });
      if (!meetingRes.ok) { const d = await meetingRes.json(); throw new Error(d.error || 'Erro ao salvar'); }

      if (members.length > 0) {
        const attendanceData = members.map((m) => ({
          member_id: m.id,
          is_present: presenceMap[m.id] ?? false,
        }));
        const attRes = await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meeting_id: meeting.id, attendance: attendanceData }),
        });
        if (!attRes.ok) { const d = await attRes.json(); throw new Error(d.error || 'Erro ao salvar presenças'); }
      }

      onSave({ meeting_date: date, meeting_time: time || null, title: title || null, notes: notes || null, meeting_type: meetingType });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Encontro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="edit-type">Tipo de Encontro</Label>
            <select id="edit-type" value={meetingType} onChange={(e) => setMeetingType(e.target.value as 'regular' | 'special_event')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="regular">Encontro Regular</option>
              <option value="special_event">Agenda Especial / Evento</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Nome / Tema do Encontro</Label>
            <Input id="meeting-title" placeholder="Ex: Estudo sobre fé, Confraternização..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-date">Data</Label>
            <Input id="meeting-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-time">Horário</Label>
            <Input id="meeting-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            <p className="text-xs text-muted-foreground">Horário padrão do grupo: {defaultTime}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-notes">Observações (opcional)</Label>
            <Input id="meeting-notes" placeholder="Outras anotações..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {members.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Presença
                </Label>
                {!loadingAttendance && (
                  <span className="text-xs text-muted-foreground">
                    {presentCount} de {members.length} presentes
                  </span>
                )}
              </div>
              {loadingAttendance ? (
                <p className="text-sm text-muted-foreground">Carregando presenças...</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto rounded-md border p-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                      onClick={() => togglePresence(member.id)}
                    >
                      <Checkbox
                        checked={presenceMap[member.id] ?? false}
                        onCheckedChange={() => togglePresence(member.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-sm">{member.full_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="pt-2 border-t">
          <DialogClose asChild><Button variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog de criação de encontro único
// ============================================================

function AddMeetingDialog({
  group,
  open,
  onOpenChange,
  onSave,
}: {
  group: GroupSettings;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: () => void;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [date, setDate] = useState(todayStr);
  const [time, setTime] = useState(group.default_meeting_time.substring(0, 5));
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [meetingType, setMeetingType] = useState<'regular' | 'special_event'>('regular');
  const [generateAttendanceList, setGenerateAttendanceList] = useState(false);
  const [createdListLink, setCreatedListLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!date) { setError('A data é obrigatória'); return; }
    setError('');
    setLoading(true);
    setCreatedListLink(null);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: date,
          meeting_time: time || null,
          title: title || null,
          notes: notes || null,
          meeting_type: meetingType,
          location: location.trim() || null,
          generate_attendance_list: meetingType === 'special_event' && generateAttendanceList,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar encontro');

      if (data.attendance_list_token) {
        const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/lista-presenca/${data.attendance_list_token}`;
        setCreatedListLink(link);
      } else {
        setDate(todayStr); setTime(group.default_meeting_time.substring(0, 5));
        setTitle(''); setNotes(''); setLocation(''); setMeetingType('regular'); setGenerateAttendanceList(false);
        onSave();
        onOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar encontro');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseAfterList = () => {
    setDate(todayStr); setTime(group.default_meeting_time.substring(0, 5));
    setTitle(''); setNotes(''); setLocation(''); setMeetingType('regular'); setGenerateAttendanceList(false);
    setCreatedListLink(null);
    onSave();
    onOpenChange(false);
  };

  const copyListLink = () => {
    if (!createdListLink) return;
    navigator.clipboard.writeText(createdListLink);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setCreatedListLink(null); setError(''); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Encontro</DialogTitle>
        </DialogHeader>
        {createdListLink ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">Encontro criado. Link da lista de presença (envie aos participantes):</p>
            <div className="flex gap-2">
              <Input readOnly value={createdListLink} className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={copyListLink}>Copiar</Button>
            </div>
            <DialogFooter>
              <Button onClick={handleCloseAfterList}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="add-type">Tipo de Encontro</Label>
                <select id="add-type" value={meetingType} onChange={(e) => setMeetingType(e.target.value as 'regular' | 'special_event')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="regular">Encontro Regular</option>
                  <option value="special_event">Agenda Especial / Evento</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-title">Nome do Encontro</Label>
                <Input id="add-title" placeholder="Ex: Encontro de Comunhão, Culto Especial..." value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-date">Data *</Label>
                <Input id="add-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-time">Horário</Label>
                <Input id="add-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-location">Local</Label>
                <Input id="add-location" placeholder="Ex: Salão da igreja, Casa do João..." value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              {meetingType === 'special_event' && (
                <div className="flex items-center space-x-2">
                  <Checkbox id="add-generate-list" checked={generateAttendanceList} onCheckedChange={(c) => setGenerateAttendanceList(c === true)} />
                  <Label htmlFor="add-generate-list" className="text-sm font-normal cursor-pointer">Gerar lista de presença (link para enviar aos participantes)</Label>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="add-notes">Observações (opcional)</Label>
                <Input id="add-notes" placeholder="Detalhes do encontro..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
              <Button onClick={handleCreate} disabled={loading}>{loading ? 'Criando...' : 'Criar Encontro'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog de configurações do grupo
// ============================================================

const DAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

function GroupSettingsDialog({
  group,
  open,
  onOpenChange,
  onSave,
}: {
  group: GroupSettings;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: () => void;
}) {
  const [day, setDay] = useState(String(group.default_meeting_day));
  const [time, setTime] = useState(group.default_meeting_time);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/groups/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_meeting_day: parseInt(day), default_meeting_time: time }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
      onSave();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configurações do Grupo</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="meeting-day">Dia padrão das reuniões</Label>
            <select id="meeting-day" value={day} onChange={(e) => setDay(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              {DAY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="default-time">Horário padrão das reuniões</Label>
            <Input id="default-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Estas configurações afetam novas reuniões geradas automaticamente.
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog de geração em lote
// ============================================================

function generateDates(startDate: string, endDate: string, weekDay: number): string[] {
  const dates: string[] = [];
  if (!startDate || !endDate) return dates;

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (start > end) return dates;

  const current = new Date(start);
  const diff = (weekDay - current.getDay() + 7) % 7;
  current.setDate(current.getDate() + diff);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 7);
  }

  return dates;
}

function BulkMeetingDialog({
  group,
  open,
  onOpenChange,
  onSave,
}: {
  group: GroupSettings;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: () => void;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const in3Months = new Date(today);
  in3Months.setMonth(in3Months.getMonth() + 3);
  const in3MonthsStr = `${in3Months.getFullYear()}-${String(in3Months.getMonth() + 1).padStart(2, '0')}-${String(in3Months.getDate()).padStart(2, '0')}`;

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(in3MonthsStr);
  const [weekDay, setWeekDay] = useState(String(group.default_meeting_day));
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const preview = generateDates(startDate, endDate, parseInt(weekDay));

  const handleCreate = async () => {
    if (preview.length === 0) { setError('Nenhuma data gerada com os parâmetros informados.'); return; }
    setError(''); setSuccess(''); setLoading(true);
    try {
      const res = await fetch('/api/meetings/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: preview, title: title || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao criar encontros'); }
      const data = await res.json();
      setSuccess(`${data.created} encontro(s) criado(s) com sucesso!`);
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar encontros');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Gerar Encontros em Lote</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          {success && <p className="text-sm text-green-700 bg-green-50 rounded-md p-2">{success}</p>}
          <div className="space-y-2">
            <Label htmlFor="bulk-title">Nome dos Encontros (opcional)</Label>
            <Input id="bulk-title" placeholder="Ex: Encontro de Comunhão, Célula..." value={title} onChange={(e) => setTitle(e.target.value)} />
            <p className="text-xs text-muted-foreground">Será aplicado a todos os encontros gerados.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-start">Data inicial</Label>
              <Input id="bulk-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-end">Data final</Label>
              <Input id="bulk-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-weekday">Dia da semana</Label>
            <select id="bulk-weekday" value={weekDay} onChange={(e) => setWeekDay(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {DAY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          {preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{preview.length} encontro(s) a criar:</p>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                {preview.map((d) => (
                  <p key={d} className="text-sm text-muted-foreground">{formatDate(d)}</p>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Datas já existentes serão ignoradas automaticamente.</p>
            </div>
          )}
          {preview.length === 0 && startDate && endDate && (
            <p className="text-sm text-muted-foreground">Nenhuma data encontrada para o período selecionado.</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
          <Button onClick={handleCreate} disabled={loading || preview.length === 0}>
            {loading ? 'Criando...' : `Criar ${preview.length} encontro(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Componente principal
// ============================================================

export function AgendaClient({
  meetings: initialMeetings,
  pastMeetings,
  group: initialGroup,
  members = [],
  readOnly = false,
  canEdit,
  canSettings,
}: AgendaClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [meetings, setMeetings] = useState(initialMeetings);
  const [localPastMeetings, setLocalPastMeetings] = useState(pastMeetings);
  const [group, setGroup] = useState(initialGroup);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showAddMeeting, setShowAddMeeting] = useState(false);

  // canEdit: leader and secretary can edit meetings; canSettings: only leader
  const canEditMeetings = canEdit !== undefined ? canEdit : !readOnly;
  const canManageSettings = canSettings !== undefined ? canSettings : !readOnly;

  useEffect(() => {
    setMeetings(initialMeetings);
    setLocalPastMeetings(pastMeetings);
    setGroup(initialGroup);
  }, [initialMeetings, pastMeetings, initialGroup]);

  const refresh = () => { startTransition(() => { router.refresh(); }); };

  const handleCancelToggle = async (meeting: Meeting) => {
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: !meeting.is_cancelled }),
      });
      if (res.ok) {
        setMeetings((prev) => prev.map((m) => m.id === meeting.id ? { ...m, is_cancelled: !m.is_cancelled } : m));
        refresh();
      }
    } catch (e) {
      console.error('Erro ao atualizar reunião:', e);
    }
  };

  const handleDelete = async (meeting: Meeting) => {
    if (!confirm(`Remover o encontro "${meeting.title ?? formatDate(meeting.meeting_date)}"? Esta ação é irreversível.`)) return;
    try {
      const res = await fetch(`/api/meetings/${meeting.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
        setLocalPastMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
        refresh();
      }
    } catch (e) {
      console.error('Erro ao remover reunião:', e);
    }
  };

  const getMeetingTime = (meeting: Meeting) =>
    meeting.meeting_time ? meeting.meeting_time.substring(0, 5) : group.default_meeting_time.substring(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Agenda</h1>
          <p className="text-muted-foreground">
            Reuniões às {getDayOfWeekName(group.default_meeting_day)}s,{' '}
            {group.default_meeting_time.substring(0, 5)}
          </p>
        </div>
        {canEditMeetings && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <Button variant="default" size="sm" onClick={() => setShowAddMeeting(true)} className="flex items-center gap-2">
              <CalendarPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Encontro</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowBulkCreate(true)} className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Gerar em Lote</span>
            </Button>
            {canManageSettings && (
              <Button variant="outline" size="sm" onClick={() => setShowGroupSettings(true)} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Configurações</span>
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Próximas Reuniões */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Próximas Reuniões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meetings && meetings.length > 0 ? (
              <div className="space-y-3">
                {meetings.map((meeting) => (
                  <div key={meeting.id} className="p-3 border rounded-lg space-y-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {meeting.meeting_type === 'special_event' && (
                          <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 border-amber-200 shrink-0">
                            <Star className="h-3 w-3 mr-1" />
                            Especial
                          </Badge>
                        )}
                        {meeting.title ? (
                          <p className="font-semibold text-sm">{meeting.title}</p>
                        ) : null}
                      </div>
                      <p className={meeting.title ? 'text-sm text-muted-foreground' : 'font-medium'}>
                        {formatDate(meeting.meeting_date)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getMeetingTime(meeting)}
                        {meeting.meeting_time && (
                          <span className="ml-1 text-blue-500">(horário alterado)</span>
                        )}
                      </p>
                      {meeting.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">{meeting.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 border-t">
                      {meeting.attendance_list_token && (
                        <>
                          <Button variant="outline" size="sm" className="h-8 text-xs" title="Copiar link da lista de presença"
                            onClick={() => {
                              const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/lista-presenca/${meeting.attendance_list_token}`;
                              navigator.clipboard.writeText(link);
                            }}>
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                            Link lista
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs" title="Ver lista de confirmação (e-mails/telefones)"
                            asChild>
                            <Link href={`/agenda/lista/${meeting.id}`}>
                              <ListChecks className="h-3.5 w-3.5 mr-1" />
                              Ver confirmação
                            </Link>
                          </Button>
                        </>
                      )}
                      {meeting.is_cancelled ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : (
                        <Badge>Confirmada</Badge>
                      )}
                      {canEditMeetings && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar encontro"
                            onClick={() => setEditingMeeting(meeting)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            title={meeting.is_cancelled ? 'Reativar reunião' : 'Cancelar reunião'}
                            onClick={() => handleCancelToggle(meeting)}>
                            {meeting.is_cancelled ? (
                              <RotateCcw className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remover encontro"
                            onClick={() => handleDelete(meeting)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Nenhuma reunião agendada para os próximos 30 dias.
                </p>
                {canEditMeetings && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddMeeting(true)} className="flex items-center gap-2">
                    <CalendarPlus className="h-4 w-4" />
                    Criar encontro
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reuniões Passadas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Histórico Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {localPastMeetings && localPastMeetings.length > 0 ? (
              <div className="space-y-3">
                {localPastMeetings.map((meeting) => (
                  <div key={meeting.id} className="p-3 border rounded-lg space-y-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {meeting.meeting_type === 'special_event' && (
                          <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 border-amber-200 shrink-0">
                            <Star className="h-3 w-3 mr-1" />
                            Especial
                          </Badge>
                        )}
                        {meeting.title && (
                          <p className="font-semibold text-sm">{meeting.title}</p>
                        )}
                      </div>
                      <p className={meeting.title ? 'text-sm text-muted-foreground' : 'font-medium'}>
                        {formatDate(meeting.meeting_date)}
                      </p>
                      {meeting.is_cancelled ? (
                        <p className="text-xs text-muted-foreground">Cancelada</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {meeting.attendanceCount}{' '}
                          {meeting.attendanceCount === 1 ? 'registro' : 'registros'} de presença
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5 border-t">
                      {meeting.attendance_list_token && (
                        <>
                          <Button variant="outline" size="sm" className="h-8 text-xs" title="Copiar link da lista de presença"
                            onClick={() => {
                              const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/lista-presenca/${meeting.attendance_list_token}`;
                              navigator.clipboard.writeText(link);
                            }}>
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                            Link lista
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs" title="Ver lista de confirmação (e-mails/telefones)"
                            asChild>
                            <Link href={`/agenda/lista/${meeting.id}`}>
                              <ListChecks className="h-3.5 w-3.5 mr-1" />
                              Ver confirmação
                            </Link>
                          </Button>
                        </>
                      )}
                      {meeting.is_cancelled && <Badge variant="outline">Folga</Badge>}
                      {canEditMeetings && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar encontro"
                            onClick={() => setEditingMeeting(meeting)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remover encontro"
                            onClick={() => handleDelete(meeting)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma reunião no histórico.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog: Editar Reunião */}
      {editingMeeting && (
        <EditMeetingDialog
          meeting={editingMeeting}
          defaultTime={group.default_meeting_time.substring(0, 5)}
          members={members}
          open={!!editingMeeting}
          onOpenChange={(v) => !v && setEditingMeeting(null)}
          onSave={(updated) => {
            if (updated) {
              setMeetings((prev) => prev.map((m) => m.id === editingMeeting.id ? { ...m, ...updated } : m));
            }
            setEditingMeeting(null);
            refresh();
          }}
        />
      )}

      {/* Dialog: Novo Encontro */}
      <AddMeetingDialog
        group={group}
        open={showAddMeeting}
        onOpenChange={setShowAddMeeting}
        onSave={() => { refresh(); setShowAddMeeting(false); }}
      />

      {/* Dialog: Gerar Encontros em Lote */}
      <BulkMeetingDialog
        group={group}
        open={showBulkCreate}
        onOpenChange={setShowBulkCreate}
        onSave={() => { refresh(); setShowBulkCreate(false); }}
      />

      {/* Dialog: Configurações do Grupo */}
      {canManageSettings && (
        <GroupSettingsDialog
          group={group}
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          onSave={() => { refresh(); setShowGroupSettings(false); }}
        />
      )}
    </div>
  );
}
