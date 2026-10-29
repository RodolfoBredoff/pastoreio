'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';

interface OrgOption {
  id: string;
  name: string;
}

interface GroupOption {
  id: string;
  name: string;
  organization_id: string;
}

export function AdminAddLeaderDialog({
  organizations,
  groups,
}: {
  organizations: OrgOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? '');
  const [groupId, setGroupId] = useState('');
  const [role, setRole] = useState('leader');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredGroups = groups.filter((g) => !orgId || g.organization_id === orgId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || null,
          organization_id: orgId,
          group_id: groupId || null,
          role: role || 'leader',
          password: password || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao criar líder');
      }
      // Resetar formulário
      setFullName('');
      setEmail('');
      setPhone('');
      setGroupId('');
      setRole('leader');
      setPassword('');
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar líder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Novo Líder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Líder</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>
          )}
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Nome do líder"
            />
          </div>
          <div className="space-y-2">
            <Label>E-mail *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="lider@email.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label>Organização *</Label>
            <select
              value={orgId}
              onChange={(e) => { setOrgId(e.target.value); setGroupId(''); }}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">— Selecione —</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); if (e.target.value === 'coordinator') setGroupId(''); }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="leader">Líder</option>
              <option value="secretary">Secretário(a)</option>
              <option value="coordinator">Coordenador(a)</option>
            </select>
            {role === 'coordinator' && (
              <p className="text-xs text-muted-foreground">
                Coordenadores têm acesso completo à sua organização e não são vinculados a um grupo específico.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Grupo (opcional)</Label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">— Sem grupo —</option>
              {filteredGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Senha de acesso (opcional)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Para acesso via senha (admin)"
            />
            <p className="text-xs text-muted-foreground">
              O líder pode fazer login via magic link sem precisar de senha.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={loading}>Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? 'Criando...' : 'Criar Líder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
