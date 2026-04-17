'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Group, Plus, Pencil } from 'lucide-react';
import { GroupsComparisonChart } from '@/components/coordinator/groups-comparison-chart';

const DAY_OPTIONS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
];

interface GroupRow {
  id: string;
  name: string;
  default_meeting_day: number;
  default_meeting_time: string;
  leader_count: number;
  member_count: number;
}

function AddGroupDialog({ onSave }: { onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [day, setDay] = useState('3');
  const [time, setTime] = useState('19:00');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/coordinator/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, default_meeting_day: parseInt(day), default_meeting_time: time }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao criar grupo');
      }
      setName(''); setDay('3'); setTime('19:00');
      setOpen(false);
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar grupo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo Grupo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar Novo Grupo</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          <div className="space-y-2">
            <Label>Nome do Grupo *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex: Grupo Alfa" />
          </div>
          <div className="space-y-2">
            <Label>Dia padrão das reuniões</Label>
            <select value={day} onChange={(e) => setDay(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Horário padrão</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
            <Button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar Grupo'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CoordinatorGroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = async () => {
    const res = await fetch('/api/coordinator/groups');
    if (res.ok) {
      const data = await res.json();
      setGroups(data);
    }
    setLoading(false);
  };

  useEffect(() => { fetchGroups(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Grupos</h1>
          <p className="text-muted-foreground mt-1">
            {groups.length} grupo{groups.length !== 1 ? 's' : ''} na organização
          </p>
        </div>
        <AddGroupDialog onSave={fetchGroups} />
      </div>

      {groups.length > 1 && <GroupsComparisonChart />}

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Nenhum grupo cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Group className="h-5 w-5" />
              Todos os Grupos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center justify-between py-3 border-b last:border-0 gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {DAY_OPTIONS.find((d) => d.value === group.default_meeting_day)?.label}s,{' '}
                      {group.default_meeting_time.substring(0, 5)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs">{group.member_count} membros</Badge>
                    <Badge variant="outline" className="text-xs">{group.leader_count} líder(es)</Badge>
                    <Link href={`/org/grupos/${group.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
