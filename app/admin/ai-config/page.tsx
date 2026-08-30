'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Sparkles,
  Save,
  Loader2,
  Clock,
  Phone,
  Bell,
  MessageSquare,
  Send,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface AIConfig {
  dailySummaryEnabled: boolean;
  dailySummaryHour: number;
  dailySummaryPhone: string;
  alertsWhatsappEnabled: boolean;
  alertsEmailEnabled: boolean;
}

export default function AIConfigPage() {
  const [config, setConfig] = useState<AIConfig>({
    dailySummaryEnabled: false,
    dailySummaryHour: 22,
    dailySummaryPhone: '',
    alertsWhatsappEnabled: false,
    alertsEmailEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSummary, setTestingSummary] = useState(false);
  const [testingAlerts, setTestingAlerts] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/admin/ai-config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error('Failed to load AI config:', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast.success('Configurações salvas com sucesso!');
      } else {
        toast.error('Erro ao salvar configurações');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setSaving(false);
    }
  };

  const testDailySummary = async () => {
    setTestingSummary(true);
    try {
      const res = await fetch('/api/ai-insights/daily-summary', { method: 'POST' });
      const data = await res.json();
      if (data.summary) {
        toast.success('Resumo gerado com sucesso!' + (data.whatsappSent ? ' Enviado via WhatsApp.' : ''));
      } else {
        toast.error(data.error || 'Erro ao gerar resumo');
      }
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setTestingSummary(false);
    }
  };

  const testAnomalyCheck = async () => {
    setTestingAlerts(true);
    try {
      const res = await fetch('/api/ai-insights/anomaly-check', { method: 'POST' });
      const data = await res.json();
      toast.success(`Verificação concluída: ${data.anomalyCount || 0} anomalia(s) detectada(s)`);
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setTestingAlerts(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Configurações IA
          </h1>
          <p className="text-muted-foreground text-sm">Resumo diário, alertas inteligentes e chat IA</p>
        </div>
      </div>

      {/* Resumo Diário */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Resumo Diário Automático</h2>
          </div>
          <button
            onClick={() => setConfig(prev => ({ ...prev, dailySummaryEnabled: !prev.dailySummaryEnabled }))}
            className="flex items-center gap-1 text-sm"
          >
            {config.dailySummaryEnabled ? (
              <ToggleRight className="w-8 h-8 text-primary" />
            ) : (
              <ToggleLeft className="w-8 h-8 text-muted-foreground" />
            )}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Receba um resumo completo do dia com faturamento, CMV, itens mais vendidos e alertas direto no WhatsApp.
        </p>

        {config.dailySummaryEnabled && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="w-4 h-4" /> Horário do envio
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={config.dailySummaryHour}
                    onChange={(e) => setConfig(prev => ({ ...prev, dailySummaryHour: parseInt(e.target.value) || 22 }))}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">:00h</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Phone className="w-4 h-4" /> WhatsApp do dono
                </Label>
                <Input
                  placeholder="5511999999999"
                  value={config.dailySummaryPhone}
                  onChange={(e) => setConfig(prev => ({ ...prev, dailySummaryPhone: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ Para envio via WhatsApp, configure a integração WhatsApp Business nas Integrações.
            </p>
          </div>
        )}
      </Card>

      {/* Alertas Inteligentes */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold">Alertas Inteligentes</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Detecta anomalias automaticamente: picos de CMV, mudanças de classificação de pratos, estoque crítico e variações de faturamento.
        </p>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Alertas via WhatsApp</span>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, alertsWhatsappEnabled: !prev.alertsWhatsappEnabled }))}
            >
              {config.alertsWhatsappEnabled ? (
                <ToggleRight className="w-7 h-7 text-primary" />
              ) : (
                <ToggleLeft className="w-7 h-7 text-muted-foreground" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              <span className="text-sm">Alertas no painel</span>
            </div>
            <button
              onClick={() => setConfig(prev => ({ ...prev, alertsEmailEnabled: !prev.alertsEmailEnabled }))}
            >
              {config.alertsEmailEnabled ? (
                <ToggleRight className="w-7 h-7 text-primary" />
              ) : (
                <ToggleLeft className="w-7 h-7 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      </Card>

      {/* Chat IA */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Pergunte ao Gastrux</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Chat com IA que usa dados reais do seu restaurante. Disponível como botão flutuante no painel.
          Pergunte sobre vendas, CMV, engenharia de cardápio, estoque e mais.
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg p-3">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>O chat está sempre disponível no botão <strong>“Pergunte ao Gastrux”</strong> no canto inferior da tela.</span>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Configurações
        </Button>
        <Button variant="outline" onClick={testDailySummary} disabled={testingSummary}>
          {testingSummary ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          Testar Resumo Diário
        </Button>
        <Button variant="outline" onClick={testAnomalyCheck} disabled={testingAlerts}>
          {testingAlerts ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
          Verificar Anomalias Agora
        </Button>
      </div>
    </div>
  );
}
