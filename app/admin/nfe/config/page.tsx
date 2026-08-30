'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import { Save, AlertCircle, Eye, EyeOff } from 'lucide-react';

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function NFeConfigPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [formData, setFormData] = useState({
    cnpj: '',
    stateRegistration: '',
    municipalRegistration: '',
    uf: 'SP',
    nfeProvider: 'focusnfe',
    nfeApiKey: '',
    seriesNFe: '1',
    seriesNFCe: '1',
    environment: 'sandbox',
    issueNFCeForCPF: true,
    issueNFeForCNPJ: true,
    contingencyMode: false,
  });

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/nfe/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setExistingConfig(data);
          setFormData({
            cnpj: data.cnpj || '',
            stateRegistration: data.stateRegistration || '',
            municipalRegistration: data.municipalRegistration || '',
            uf: data.uf || 'SP',
            nfeProvider: data.nfeProvider || 'focusnfe',
            nfeApiKey: '',
            seriesNFe: String(data.seriesNFe || 1),
            seriesNFCe: String(data.seriesNFCe || 1),
            environment: data.environment || 'sandbox',
            issueNFCeForCPF: data.issueNFCeForCPF ?? true,
            issueNFeForCNPJ: data.issueNFeForCNPJ ?? true,
            contingencyMode: data.contingencyMode ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === 'loading' || loading) return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  const handleSave = async () => {
    const cnpjClean = formData.cnpj.replace(/\D/g, '');
    if (cnpjClean.length !== 14) {
      toast.error('CNPJ inválido');
      return;
    }
    if (!existingConfig && !formData.nfeApiKey) {
      toast.error('API Key obrigatória para criar configuração');
      return;
    }

    try {
      setSaving(true);
      const body: any = {
        cnpj: cnpjClean,
        stateRegistration: formData.stateRegistration || null,
        municipalRegistration: formData.municipalRegistration || null,
        uf: formData.uf,
        nfeProvider: formData.nfeProvider,
        seriesNFe: parseInt(formData.seriesNFe),
        seriesNFCe: parseInt(formData.seriesNFCe),
        environment: formData.environment,
        issueNFCeForCPF: formData.issueNFCeForCPF,
        issueNFeForCNPJ: formData.issueNFeForCNPJ,
        contingencyMode: formData.contingencyMode,
      };
      if (formData.nfeApiKey) body.nfeApiKey = formData.nfeApiKey;

      const response = await fetch('/api/nfe/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar');
      }

      const saved = await response.json();
      setExistingConfig(saved);
      setFormData({ ...formData, nfeApiKey: '' });
      toast.success('Configuração salva');
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">
              Configuração NF-e/NFC-e
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Credenciais e parâmetros fiscais para emissão
          </p>
        </div>
      </div>

      <Card className="border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-semibold">Provedor recomendado: Focus NFe</p>
            <p>
              API REST que encapsula SEFAZ, assina XML com certificado A1 e retorna QR Code + DANFCe.
              Crie conta em{' '}
              <a
                href="https://focusnfe.com.br"
                target="_blank"
                rel="noopener"
                className="underline font-semibold"
              >
                focusnfe.com.br
              </a>
              , envie o certificado e copie o Token na aba API.
            </p>
            <p className="text-xs">
              Modo <strong>homologação</strong> sem API Key → o sistema usa resposta simulada (ideal para testes).
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cnpj">CNPJ *</Label>
            <Input
              id="cnpj"
              placeholder="00.000.000/0000-00"
              value={formData.cnpj}
              onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uf">UF</Label>
            <select
              id="uf"
              value={formData.uf}
              onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {UFS.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stateRegistration">Inscrição Estadual</Label>
            <Input
              id="stateRegistration"
              placeholder="123.456.789.012"
              value={formData.stateRegistration}
              onChange={(e) => setFormData({ ...formData, stateRegistration: e.target.value })}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="municipalRegistration">Inscrição Municipal</Label>
            <Input
              id="municipalRegistration"
              placeholder="(opcional)"
              value={formData.municipalRegistration}
              onChange={(e) => setFormData({ ...formData, municipalRegistration: e.target.value })}
              disabled={saving}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="provider">Provedor</Label>
            <select
              id="provider"
              value={formData.nfeProvider}
              onChange={(e) => setFormData({ ...formData, nfeProvider: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="focusnfe">Focus NFe</option>
              <option value="webmaniabr">WebmaniaBR</option>
              <option value="nfeio">NFe.io</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="environment">Ambiente</Label>
            <select
              id="environment"
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="sandbox">Homologação (teste)</option>
              <option value="production">Produção</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contingencyMode">Modo contingência</Label>
            <div className="flex items-center h-10">
              <input
                id="contingencyMode"
                type="checkbox"
                checked={formData.contingencyMode}
                onChange={(e) => setFormData({ ...formData, contingencyMode: e.target.checked })}
                disabled={saving}
                className="h-4 w-4"
              />
              <span className="text-sm ml-2">Ativar (SEFAZ off-line)</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="seriesNFe">Série NF-e</Label>
            <Input
              id="seriesNFe"
              type="number"
              min="1"
              value={formData.seriesNFe}
              onChange={(e) => setFormData({ ...formData, seriesNFe: e.target.value })}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seriesNFCe">Série NFC-e</Label>
            <Input
              id="seriesNFCe"
              type="number"
              min="1"
              value={formData.seriesNFCe}
              onChange={(e) => setFormData({ ...formData, seriesNFCe: e.target.value })}
              disabled={saving}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-2">
          <Label htmlFor="nfeApiKey">
            API Token (Focus NFe) {existingConfig ? '(deixe vazio para manter)' : '*'}
          </Label>
          <div className="relative">
            <Input
              id="nfeApiKey"
              type={showKey ? 'text' : 'password'}
              placeholder="Seu token do provedor"
              value={formData.nfeApiKey}
              onChange={(e) => setFormData({ ...formData, nfeApiKey: e.target.value })}
              disabled={saving}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Mostrar token"
            >
              {showKey ? <EyeOff size={18} className="text-muted-foreground" /> : <Eye size={18} className="text-muted-foreground" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Armazenado em banco. Use tokens distintos para homologação e produção.
          </p>
        </div>

        <div className="border-t pt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.issueNFCeForCPF}
              onChange={(e) => setFormData({ ...formData, issueNFCeForCPF: e.target.checked })}
              disabled={saving}
              className="h-4 w-4"
            />
            Emitir NFC-e para clientes pessoa física (CPF)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.issueNFeForCNPJ}
              onChange={(e) => setFormData({ ...formData, issueNFeForCNPJ: e.target.checked })}
              disabled={saving}
              className="h-4 w-4"
            />
            Emitir NF-e para clientes pessoa jurídica (CNPJ)
          </label>
        </div>

        {existingConfig && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-2">Status</h3>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>Próximo número NF-e: {existingConfig.nextNumberNFe}</p>
              <p>Próximo número NFC-e: {existingConfig.nextNumberNFCe}</p>
              <p>
                Ambiente: <strong className={existingConfig.environment === 'production' ? 'text-red-600' : 'text-blue-600'}>
                  {existingConfig.environment === 'production' ? 'Produção' : 'Homologação'}
                </strong>
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 border-t pt-4">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save size={18} />
            {saving ? 'Salvando...' : 'Salvar configuração'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
