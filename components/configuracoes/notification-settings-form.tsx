'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, MessageSquare, BarChart3 } from 'lucide-react';

interface NotificationSettingsFormProps {
  groupId: string;
  initialReminderEnabled: boolean;
  initialAbsenceWhatsappEnabled: boolean;
  initialWeeklySummaryEnabled: boolean;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 p-2 rounded-md bg-muted shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          checked ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function NotificationSettingsForm({
  groupId,
  initialReminderEnabled,
  initialAbsenceWhatsappEnabled,
  initialWeeklySummaryEnabled,
}: NotificationSettingsFormProps) {
  const [reminderEnabled, setReminderEnabled] = useState(initialReminderEnabled);
  const [absenceWhatsappEnabled, setAbsenceWhatsappEnabled] = useState(initialAbsenceWhatsappEnabled);
  const [weeklySummaryEnabled, setWeeklySummaryEnabled] = useState(initialWeeklySummaryEnabled);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      const res = await fetch('/api/groups/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reminder_enabled: reminderEnabled,
          absence_whatsapp_enabled: absenceWhatsappEnabled,
          weekly_summary_enabled: weeklySummaryEnabled,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao salvar');
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notificações Automáticas
        </CardTitle>
        <CardDescription>
          Configure quais alertas e lembretes o grupo recebe automaticamente.
          Requer WhatsApp Business API configurada pelo administrador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div>
          <Toggle
            checked={reminderEnabled}
            onChange={setReminderEnabled}
            label="Lembrete pré-encontro"
            description="Envia mensagem individual pelo WhatsApp a cada membro no dia anterior ao encontro. Você recebe por e-mail um link para postar no grupo."
            icon={MessageSquare}
          />
          <Toggle
            checked={absenceWhatsappEnabled}
            onChange={setAbsenceWhatsappEnabled}
            label="WhatsApp para membro ausente"
            description="Quando um membro acumular faltas consecutivas, envia automaticamente uma mensagem de saudade pelo WhatsApp para ele."
            icon={MessageSquare}
          />
          <Toggle
            checked={weeklySummaryEnabled}
            onChange={setWeeklySummaryEnabled}
            label="Resumo semanal por e-mail"
            description="Toda segunda-feira, você recebe um resumo com presença, aniversários da semana, visitantes em acompanhamento e alertas de faltas."
            icon={BarChart3}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2 mt-4">{error}</p>
        )}
        {success && (
          <p className="text-sm text-green-700 bg-green-50 rounded-md p-2 mt-4">
            Configurações salvas com sucesso!
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
