'use client';

import { useState, useEffect } from 'react';
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
import { Users, UserPlus, Pencil, Trash2, KeyRound } from 'lucide-react';

interface LeaderRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  group_id: string | null;
  group_name: string | null;
}

interface GroupOption {
  id: string;
  name: string;
}

function AddLeaderDialog({ groups, onSave }: { groups: GroupOption[]; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [groupId, setGroupId] = useState('');
  const [role, setRole] = useState('leader');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/coordinator/leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, email, phone: phone || null, group_id: groupId || null, role, password: password || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao criar líder'); }
      setFullName(''); setEmail(''); setPhone(''); setGroupId(''); setPassword('');
      setOpen(false);
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar líder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><UserPlus className="mr-2 h-4 w-4" />Novo Líder</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar Líder / Secretário</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Nome" />
          </div>
          <div className="space-y-2">
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="email@exemplo.com" />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="leader">Líder</option>
              <option value="secretary">Secretário(a)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Grupo (opcional)</Label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Sem grupo —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Senha de acesso (opcional)</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Para acesso via senha" />
            <p className="text-xs text-muted-foreground">
              Se informada: mais de 10 caracteres, uma maiúscula, uma minúscula e um número. O usuário deverá trocá-la no primeiro login.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
            <Button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLeaderDialog({
  leader, groups, open, onOpenChange, onSave,
}: {
  leader: LeaderRow; groups: GroupOption[]; open: boolean;
  onOpenChange: (v: boolean) => void; onSave: () => void;
}) {
  const [fullName, setFullName] = useState(leader.full_name);
  const [phone, setPhone] = useState(leader.phone ?? '');
  const [groupId, setGroupId] = useState(leader.group_id ?? '');
  const [role, setRole] = useState(leader.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/coordinator/leaders/${leader.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, phone: phone || null, group_id: groupId || null, role }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
      onOpenChange(false);
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Líder</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="leader">Líder</option>
              <option value="secretary">Secretário(a)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Grupo</Label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Sem grupo —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={loading}>Cancelar</Button></DialogClose>
          <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  leader, open, onOpenChange, onDone,
}: {
  leader: LeaderRow | null; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const handleReset = async () => {
    if (!leader) return;
    setError('');
    setLoading(true);
    setTemporaryPassword(null);
    try {
      const res = await fetch(`/api/coordinator/leaders/${leader.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha');
      setTemporaryPassword(data.temporary_password ?? null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao redefinir senha');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTemporaryPassword(null);
    setError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Redefinir senha</DialogTitle></DialogHeader>
        {temporaryPassword ? (
          <div className="space-y-3">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              Senha redefinida. O usuário deverá alterá-la no próximo login.
            </p>
            <div className="space-y-2">
              <Label>Senha temporária (passe ao usuário)</Label>
              <div className="flex gap-2">
                <Input readOnly value={temporaryPassword} className="font-mono" />
                <Button type="button" variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(temporaryPassword); alert('Copiado!'); }}>
                  Copiar
                </Button>
              </div>
            </div>
            <Button onClick={handleClose}>Fechar</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Será gerada uma nova senha para <strong>{leader?.full_name}</strong>. O usuário precisará alterá-la no próximo login.
            </p>
            {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={loading}>Cancelar</Button>
              </DialogClose>
              <Button onClick={handleReset} disabled={loading}>
                {loading ? 'Redefinindo...' : 'Gerar nova senha'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CoordinatorLeadersPage() {
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingLeader, setEditingLeader] = useState<LeaderRow | null>(null);
  const [resetPwLeader, setResetPwLeader] = useState<LeaderRow | null>(null);

  const fetchData = async () => {
    const [leadersRes, groupsRes] = await Promise.all([
      fetch('/api/coordinator/leaders'),
      fetch('/api/coordinator/groups'),
    ]);
    if (leadersRes.ok) setLeaders(await leadersRes.json());
    if (groupsRes.ok) setGroups(await groupsRes.json());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este líder? Esta ação é irreversível.')) return;
    const res = await fetch(`/api/coordinator/leaders/${id}`, { method: 'DELETE' });
    if (res.ok) fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Líderes</h1>
          <p className="text-muted-foreground mt-1">
            {leaders.length} líder{leaders.length !== 1 ? 'es' : ''} na organização
          </p>
        </div>
        <AddLeaderDialog groups={groups} onSave={fetchData} />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Líderes e Secretários
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum líder cadastrado.</p>
            ) : (
              <div className="space-y-0">
                {leaders.map((leader) => (
                  <div key={leader.id} className="flex items-center justify-between py-3 border-b last:border-0 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{leader.full_name}</p>
                      <p className="text-xs text-muted-foreground">{leader.email}</p>
                      {leader.phone && <p className="text-xs text-muted-foreground">{leader.phone}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {leader.group_name ? (
                        <Badge variant="secondary" className="text-xs">{leader.group_name}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">Sem grupo</Badge>
                      )}
                      <Badge variant={leader.role === 'leader' ? 'default' : 'outline'} className="text-xs">
                        {leader.role === 'leader' ? 'Líder' : 'Secretário'}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Redefinir senha" onClick={() => setResetPwLeader(leader)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingLeader(leader)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(leader.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editingLeader && (
        <EditLeaderDialog
          leader={editingLeader}
          groups={groups}
          open={!!editingLeader}
          onOpenChange={(v) => !v && setEditingLeader(null)}
          onSave={fetchData}
        />
      )}

      <ResetPasswordDialog
        leader={resetPwLeader}
        open={!!resetPwLeader}
        onOpenChange={(v) => !v && setResetPwLeader(null)}
        onDone={fetchData}
      />
    </div>
  );
}
