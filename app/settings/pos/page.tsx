'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Label, BackButton } from '@/components/ui';
import { Save, AlertCircle, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface POSSettings {
  provider: string;
  isConfigured: boolean;
  squareLocationId?: string;
  squareMerchantId?: string;
  sumupMerchantId?: string;
  webhookSecret?: string;
}

export default function POSSettingsPage() {
  const [settings, setSettings] = useState<POSSettings>({
    provider: 'SQUARE',
    isConfigured: false,
  });
  const [provider, setProvider] = useState<'SQUARE' | 'SUMUP'>('SQUARE');
  const [squareAccessToken, setSquareAccessToken] = useState('');
  const [squareLocationId, setSquareLocationId] = useState('');
  const [squareMerchantId, setSquareMerchantId] = useState('');
  const [sumupApiKey, setSumupApiKey] = useState('');
  const [sumupMerchantId, setSumupMerchantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    fetchSettings();
    // Gerar URL do webhook
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/pos/transactions`);
    }
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pos/settings');
      const data = await response.json();
      
      if (data) {
        setSettings(data);
        setProvider(data.provider || 'SQUARE');
        setSquareLocationId(data.squareLocationId || '');
        setSquareMerchantId(data.squareMerchantId || '');
        setSumupMerchantId(data.sumupMerchantId || '');
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (provider === 'SQUARE') {
        if (!squareAccessToken || !squareLocationId) {
          toast.error('Preencha todos os campos obrigatórios do Square');
          return;
        }
      } else if (provider === 'SUMUP') {
        if (!sumupApiKey || !sumupMerchantId) {
          toast.error('Preencha todos os campos obrigatórios do Sumup');
          return;
        }
      }

      const payload = {
        provider,
        ...(provider === 'SQUARE' && {
          squareAccessToken,
          squareLocationId,
          squareMerchantId: squareMerchantId || undefined,
        }),
        ...(provider === 'SUMUP' && {
          sumupApiKey,
          sumupMerchantId,
        }),
      };

      const response = await fetch('/api/pos/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Erro ao salvar configurações');

      toast.success('Configurações salvas com sucesso!');
      
      // Limpar tokens sensíveis do formulário
      setSquareAccessToken('');
      setSumupApiKey('');
      
      // Recarregar configurações
      await fetchSettings();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL do webhook copiada!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:space-y-6 sm:p-6">
      <div>
        <BackButton />
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mt-2">Configurações de POS</h1>
        <p className="text-sm text-gray-600 mt-1">Integre sua solução de pagamento (Square ou Sumup)</p>
      </div>

      {/* Status */}
      {!loading && (
        <Card className={`p-4 border-l-4 ${
          settings.isConfigured
            ? 'border-l-green-500 bg-green-50'
            : 'border-l-yellow-500 bg-yellow-50'
        }`}>
          <div className="flex items-center gap-3">
            {settings.isConfigured ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {settings.isConfigured ? 'POS Configurado' : 'POS Não Configurado'}
              </p>
              <p className="text-sm text-gray-600">
                {settings.isConfigured
                  ? `Usando ${settings.provider}`
                  : 'Configure uma solução de pagamento para começar'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {!loading && (
        <Card className="p-6">
          {/* Provider Selection */}
          <div className="mb-6">
            <Label className="text-base font-semibold mb-3 block">Escolha o Provedor</Label>
            <div className="grid grid-cols-2 gap-3">
              {(['SQUARE', 'SUMUP'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  className={`p-4 rounded-lg border-2 transition ${
                    provider === p
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{p}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {p === 'SQUARE' ? 'Processamento de pagamentos' : 'POS portátil'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-6">
            {provider === 'SQUARE' ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="square-token">Access Token Square *</Label>
                  <Input
                    id="square-token"
                    type="password"
                    placeholder="sq_live_..."
                    value={squareAccessToken}
                    onChange={e => setSquareAccessToken(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Obtenha em: https://developer.squareup.com/apps</p>
                </div>

                <div>
                  <Label htmlFor="square-location">Location ID (Square) *</Label>
                  <Input
                    id="square-location"
                    placeholder="ex: L123ABC456..."
                    value={squareLocationId}
                    onChange={e => setSquareLocationId(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">ID único da sua loja no Square</p>
                </div>

                <div>
                  <Label htmlFor="square-merchant">Merchant ID (Square)</Label>
                  <Input
                    id="square-merchant"
                    placeholder="ex: MERCHANT_ID"
                    value={squareMerchantId}
                    onChange={e => setSquareMerchantId(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Opcional - para rastreamento avançado</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sumup-key">API Key Sumup *</Label>
                  <Input
                    id="sumup-key"
                    type="password"
                    placeholder="seu_api_key_sumup"
                    value={sumupApiKey}
                    onChange={e => setSumupApiKey(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Obtenha em: https://developer.sumup.com</p>
                </div>

                <div>
                  <Label htmlFor="sumup-merchant">Merchant ID (Sumup) *</Label>
                  <Input
                    id="sumup-merchant"
                    placeholder="seu_merchant_id"
                    value={sumupMerchantId}
                    onChange={e => setSumupMerchantId(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">ID único de sua conta Sumup</p>
                </div>
              </div>
            )}

            {/* Webhook URL */}
            <div className="mt-6 pt-6 border-t">
              <Label className="font-semibold text-gray-900">URL do Webhook</Label>
              <p className="text-sm text-gray-600 mt-2">Configure no seu painel {provider} para sincronizar transações:</p>
              <div className="flex items-center gap-2 mt-3 bg-gray-50 p-3 rounded-lg">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 bg-transparent text-sm font-mono text-gray-700 outline-none"
                />
                <button
                  onClick={copyWebhookUrl}
                  className="p-2 hover:bg-gray-200 rounded transition"
                  title="Copiar URL"
                >
                  <Copy className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-6"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </Card>
      )}

      {loading && (
        <Card className="p-8 text-center">
          <div className="animate-spin h-8 w-8 mx-auto border-4 border-orange-200 border-t-orange-500 rounded-full" />
          <p className="text-gray-600 mt-4">Carregando configurações...</p>
        </Card>
      )}
    </div>
  );
}
