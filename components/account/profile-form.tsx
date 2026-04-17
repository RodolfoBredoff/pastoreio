'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserCircle, MessageCircle, CheckCircle2, AlertCircle, Phone } from 'lucide-react';

interface ProfileFormProps {
  initialName: string;
  initialPhone: string | null;
  /** true se as credenciais Meta WhatsApp estiverem configuradas no sistema */
  whatsappEnabled: boolean;
}

function WhatsAppStatus({
  whatsappEnabled,
  hasPhone,
}: {
  whatsappEnabled: boolean;
  hasPhone: boolean;
}) {
  if (!whatsappEnabled) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Notificações de WhatsApp ainda não estão ativadas pelo administrador do sistema.
          Você ainda receberá os alertas por e-mail.
        </span>
      </div>
    );
  }

  if (!hasPhone) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        <Phone className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" />
        <span>
          Cadastre seu telefone abaixo para receber notificações automáticas de aniversários
          diretamente no seu WhatsApp.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
      <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
      <span>
        WhatsApp ativo. Você receberá uma mensagem automática no seu celular quando um
        participante do seu grupo fizer aniversário.
      </span>
    </div>
  );
}

export function ProfileForm({ initialName, initialPhone, whatsappEnabled }: ProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const isDirty = name !== initialName || phone !== (initialPhone ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, phone }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Erro ao salvar.');
      } else {
        setSuccess('Perfil atualizado com sucesso!');
        // Recarrega a página para refletir o novo nome/telefone no layout
        setTimeout(() => window.location.reload(), 800);
      }
    } catch {
      setError('Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  const hasPhone = phone.replace(/\D/g, '').length >= 8;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-4 w-4" />
          Informações do Perfil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Status das notificações WhatsApp */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <MessageCircle className="h-3.5 w-3.5" />
            Notificações de WhatsApp
          </div>
          <WhatsAppStatus whatsappEnabled={whatsappEnabled} hasPhone={hasPhone} />
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              {success}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome completo</Label>
            <Input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              required
              minLength={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">
              Telefone (WhatsApp)
              <span className="text-muted-foreground font-normal ml-1 text-xs">— com DDD</span>
            </Label>
            <Input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
            <p className="text-xs text-muted-foreground">
              Este número receberá alertas automáticos de aniversários do seu grupo via WhatsApp.
            </p>
          </div>

          <Button type="submit" disabled={loading || !isDirty}>
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
