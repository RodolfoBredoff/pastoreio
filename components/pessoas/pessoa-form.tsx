'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MEMBER_TYPES, MEMBER_TYPE_LABELS } from '@/lib/constants';
import { Loader2 } from 'lucide-react';

interface OtherMember {
  id: string;
  full_name: string;
}

interface PessoaFormProps {
  groupId: string;
  initialData?: {
    id: string;
    full_name: string;
    phone: string;
    birth_date: string | null;
    member_type: 'participant' | 'visitor';
    discipulador_id?: string | null;
    discipulador_full_name?: string | null;
  };
  /** Outros membros do grupo (para select de discipulador). Apenas em edição. */
  otherMembers?: OtherMember[];
  /** Se o usuário pode alterar o vínculo discipulador (líder/secretário). */
  canManageDiscipleship?: boolean;
}

const MONTHS = [
  { value: '', label: 'Mês' },
  { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' }, { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

function parseBirthDate(val: string | null | undefined): { day: string; month: string; year: string } {
  if (!val || typeof val !== 'string') return { day: '', month: '', year: '' };
  const dateOnly = val.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length < 3) return { day: '', month: '', year: '' };
  const [y, m, d] = parts;
  return {
    day: (d || '').replace(/\D/g, ''),
    month: (m || '').replace(/\D/g, ''),
    // Show empty year if it's the placeholder year (1900)
    year: (y === '1900' || !y) ? '' : (y || '').replace(/\D/g, ''),
  };
}

/**
 * Formats day/month/year into a date string.
 * If year is not provided, uses 1900 as a placeholder.
 * Returns null if neither day nor month are provided.
 */
function formatBirthDate(day: string, month: string, year: string): string | null {
  if (!day || !month) return null;
  const d = day.padStart(2, '0');
  const m = month.padStart(2, '0');
  const y = year ? year.padStart(4, '0') : '1900';
  return `${y}-${m}-${d}`;
}

function isPlaceholderYear(year: string | null | undefined): boolean {
  return !year || year === '1900';
}

export function PessoaForm({ groupId, initialData, otherMembers = [], canManageDiscipleship = false }: PessoaFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState(() => {
    const parsed = parseBirthDate(initialData?.birth_date);
    return {
      full_name: initialData?.full_name || '',
      phone: initialData?.phone || '',
      birth_day: parsed.day,
      birth_month: parsed.month,
      birth_year: parsed.year,
      member_type: initialData?.member_type || MEMBER_TYPES.PARTICIPANT,
      discipulador_id: initialData?.discipulador_id ?? '',
    };
  });

  useEffect(() => {
    if (initialData) {
      const parsed = parseBirthDate(initialData.birth_date);
      setFormData({
        full_name: initialData.full_name || '',
        phone: initialData.phone || '',
        birth_day: parsed.day,
        birth_month: parsed.month,
        birth_year: parsed.year,
        member_type: initialData.member_type || MEMBER_TYPES.PARTICIPANT,
        discipulador_id: initialData.discipulador_id ?? '',
      });
    }
  }, [initialData?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If some birthday fields are filled, validate consistency
    const hasBirthdayPartial = formData.birth_day || formData.birth_month;
    if (hasBirthdayPartial && (!formData.birth_day || !formData.birth_month)) {
      alert('Para cadastrar o aniversário, preencha pelo menos o dia e o mês.');
      return;
    }

    const birth_date = hasBirthdayPartial
      ? formatBirthDate(formData.birth_day, formData.birth_month, formData.birth_year)
      : null;

    setLoading(true);

    const payload: Record<string, unknown> = {
      full_name: formData.full_name,
      phone: formData.phone,
      member_type: formData.member_type,
    };
    // Incluir birth_date sempre na edição para permitir limpar (null); na criação só envia se preenchido
    if (initialData) {
      payload.birth_date = birth_date;
      if (canManageDiscipleship) {
        payload.discipulador_id = formData.discipulador_id === '' ? null : formData.discipulador_id;
      }
    } else if (birth_date !== null) {
      payload.birth_date = birth_date;
    }

    try {
      if (initialData) {
        const response = await fetch(`/api/members/${initialData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Erro ao atualizar pessoa');
        }
      } else {
        const response = await fetch('/api/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Erro ao criar pessoa');
        }
      }

      router.push('/pessoas');
      router.refresh();
    } catch (error: any) {
      console.error('Error saving member:', error);
      alert('Erro ao salvar pessoa: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="full_name">Nome Completo *</Label>
        <Input
          id="full_name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          required
          placeholder="João da Silva"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Telefone (com DDD) *</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          required
          placeholder="(11) 98765-4321"
          type="tel"
        />
      </div>

      <div className="space-y-2">
        <Label>Data de Aniversário <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
        <p className="text-xs text-muted-foreground">
          Preencha ao menos dia e mês — o ano é opcional. O líder será notificado no dia do aniversário. Para remover a data, deixe os campos em branco e salve.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="birth_day" className="text-xs font-normal text-muted-foreground">Dia</Label>
            <Input
              id="birth_day"
              placeholder="DD"
              maxLength={2}
              value={formData.birth_day}
              onChange={(e) => setFormData({ ...formData, birth_day: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <div>
            <Label htmlFor="birth_month" className="text-xs font-normal text-muted-foreground">Mês</Label>
            <select
              id="birth_month"
              value={formData.birth_month}
              onChange={(e) => setFormData({ ...formData, birth_month: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="birth_year" className="text-xs font-normal text-muted-foreground">Ano</Label>
            <Input
              id="birth_year"
              placeholder="AAAA"
              maxLength={4}
              value={formData.birth_year}
              onChange={(e) => setFormData({ ...formData, birth_year: e.target.value.replace(/\D/g, '') })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="member_type">Tipo *</Label>
        <Select
          value={formData.member_type}
          onValueChange={(value) =>
            setFormData({ ...formData, member_type: value as 'participant' | 'visitor' })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={MEMBER_TYPES.PARTICIPANT}>
              {MEMBER_TYPE_LABELS[MEMBER_TYPES.PARTICIPANT]}
            </SelectItem>
            <SelectItem value={MEMBER_TYPES.VISITOR}>
              {MEMBER_TYPE_LABELS[MEMBER_TYPES.VISITOR]}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {initialData && (canManageDiscipleship ? (
        <div className="space-y-2">
          <Label htmlFor="discipulador_id">Discipulado por</Label>
          <Select
            value={formData.discipulador_id === '' || formData.discipulador_id === null ? '__none__' : formData.discipulador_id}
            onValueChange={(value) =>
              setFormData({ ...formData, discipulador_id: value === '__none__' ? '' : value })
            }
          >
            <SelectTrigger id="discipulador_id">
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nenhum</SelectItem>
              {otherMembers
                .filter((m) => m.id !== initialData.id)
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Atrelar esta pessoa a um discipulador (outro membro do grupo). O discipulador aparecerá com o label &quot;Discipulador de {initialData.full_name}&quot;.
          </p>
        </div>
      ) : initialData.discipulador_full_name ? (
        <div className="space-y-1">
          <Label className="text-muted-foreground">Discipulado por</Label>
          <p className="text-sm">{initialData.discipulador_full_name}</p>
        </div>
      ) : null)}

      <div className="flex gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
          className="flex-1"
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {initialData ? 'Atualizar' : 'Cadastrar'}
        </Button>
      </div>
    </form>
  );
}
