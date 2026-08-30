// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Save, Building2, Clock, MapPin, Globe, Loader2 } from 'lucide-react';

const DAYS = [
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terça' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

const DEFAULT_HOURS = {
  seg: { open: '11:00', close: '23:00', closed: false },
  ter: { open: '11:00', close: '23:00', closed: false },
  qua: { open: '11:00', close: '23:00', closed: false },
  qui: { open: '11:00', close: '23:00', closed: false },
  sex: { open: '11:00', close: '00:00', closed: false },
  sab: { open: '11:00', close: '00:00', closed: false },
  dom: { open: '11:00', close: '22:00', closed: false },
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezones, setTimezones] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    cnpj: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    timezone: 'America/Sao_Paulo',
    logoUrl: '',
  });
  const [hours, setHours] = useState(DEFAULT_HOURS);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/restaurant/settings');
      if (!res.ok) throw new Error();
      const data = await res.json();
      const r = data.restaurant;
      setTimezones(data.timezones || []);
      setStates(data.states || []);
      setForm({
        name: r.name || '',
        cnpj: r.cnpj || '',
        email: r.email || '',
        phone: r.phone || '',
        website: r.website || '',
        address: r.address || '',
        city: r.city || '',
        state: r.state || '',
        zipCode: r.zipCode || '',
        timezone: r.timezone || 'America/Sao_Paulo',
        logoUrl: r.logoUrl || '',
      });
      if (r.businessHours && typeof r.businessHours === 'object') {
        setHours({ ...DEFAULT_HOURS, ...r.businessHours });
      }
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateHour(day: string, field: string, value: any) {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Nome do restaurante é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/restaurant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, businessHours: hours }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao salvar');
      }
      toast.success('Configurações salvas com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }

  function formatCNPJ(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }

  function formatPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton href="/admin" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Configurações</h1>
            <p className="text-sm text-gray-600">Dados e horários do restaurante</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar alterações
        </Button>
      </div>

      {/* Dados do Restaurante */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Dados do Restaurante</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nome do restaurante *</Label>
            <Input id="name" value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Meu Restaurante" />
          </div>
          <div>
            <Label htmlFor="cnpj">CNPJ</Label>
            <Input id="cnpj" value={form.cnpj} onChange={e => updateField('cnpj', formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} placeholder="contato@restaurante.com" />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={form.phone} onChange={e => updateField('phone', formatPhone(e.target.value))} placeholder="(11) 99999-9999" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" value={form.website} onChange={e => updateField('website', e.target.value)} placeholder="https://meurestaurante.com.br" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="logoUrl">URL do Logotipo</Label>
            <Input id="logoUrl" value={form.logoUrl} onChange={e => updateField('logoUrl', e.target.value)} placeholder="https://i.pinimg.com/236x/9b/c2/ce/9bc2ce0fe3ab1f888210b4299510d960.jpg" />
            {form.logoUrl && (
              <div className="mt-2 w-20 h-20 rounded-lg border bg-gray-50 overflow-hidden flex items-center justify-center">
                <img src={form.logoUrl} alt="Logo preview" className="max-w-full max-h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Endereço */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold">Endereço</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={form.address} onChange={e => updateField('address', e.target.value)} placeholder="Rua Exemplo, 123 - Bairro" />
          </div>
          <div>
            <Label htmlFor="city">Cidade</Label>
            <Input id="city" value={form.city} onChange={e => updateField('city', e.target.value)} placeholder="São Paulo" />
          </div>
          <div>
            <Label htmlFor="state">Estado</Label>
            <select id="state" value={form.state} onChange={e => updateField('state', e.target.value)} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white">
              <option value="">Selecione...</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="zipCode">CEP</Label>
            <Input id="zipCode" value={form.zipCode} onChange={e => updateField('zipCode', e.target.value.replace(/\D/g, '').slice(0,8))} placeholder="01234567" />
          </div>
        </div>
      </Card>

      {/* Fuso Horário */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold">Regional</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="timezone">Fuso horário</Label>
            <select id="timezone" value={form.timezone} onChange={e => updateField('timezone', e.target.value)} className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm bg-white">
              {timezones.map(tz => <option key={tz} value={tz}>{tz.replace('America/', '')}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Horário de Funcionamento */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold">Horário de Funcionamento</h2>
        </div>
        <div className="space-y-3">
          {DAYS.map(day => {
            const h = hours[day.key] || { open: '11:00', close: '23:00', closed: false };
            return (
              <div key={day.key} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b last:border-0">
                <div className="w-24 font-medium text-sm">{day.label}</div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={h.closed}
                    onChange={e => updateHour(day.key, 'closed', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Fechado
                </label>
                {!h.closed && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={h.open}
                      onChange={e => updateHour(day.key, 'open', e.target.value)}
                      className="w-32"
                    />
                    <span className="text-gray-400">às</span>
                    <Input
                      type="time"
                      value={h.close}
                      onChange={e => updateHour(day.key, 'close', e.target.value)}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Footer save */}
      <div className="flex justify-end pb-6">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
