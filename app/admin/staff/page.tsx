// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Users, Plus, Phone, Mail, Clock, DollarSign, Search, X, Loader2 } from 'lucide-react';

interface StaffMember {
  id: string;
  userId: string;
  cpf?: string;
  phone?: string;
  role: string;
  status: string;
  startDate: string;
  basesalary?: number;
  commissionType: string;
  commissionValue?: number;
  defaultStartTime?: string;
  defaultEndTime?: string;
  user: { id: string; name: string; email: string };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'bg-green-100 text-green-700' },
  INACTIVE: { label: 'Inativo', color: 'bg-gray-100 text-gray-600' },
  ON_LEAVE: { label: 'Afastado', color: 'bg-yellow-100 text-yellow-700' },
  TERMINATED: { label: 'Desligado', color: 'bg-red-100 text-red-700' },
};

const ROLE_MAP: Record<string, string> = {
  OWNER: 'Proprietário', MANAGER: 'Gerente', CASHIER: 'Caixa', COOK: 'Cozinheiro', ADMIN: 'Admin',
};

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', cpf: '', staffRole: 'COOK',
    baseSalary: '', commissionType: 'PERCENTAGE', commissionValue: '',
    defaultStartTime: '08:00', defaultEndTime: '18:00',
  });

  const fetchMembers = async () => {
    try {
      const res = await fetch('/api/admin/staff');
      const data = await res.json();
      setMembers(data.members || []);
    } catch { toast.error('Erro ao carregar equipe'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleSubmit = async () => {
    if (!form.name || !form.email) { toast.error('Nome e email são obrigatórios'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          baseSalary: form.baseSalary ? parseFloat(form.baseSalary) : null,
          commissionValue: form.commissionValue ? parseFloat(form.commissionValue) : null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Funcionário adicionado!');
      setShowForm(false);
      setForm({ name: '', email: '', phone: '', cpf: '', staffRole: 'COOK', baseSalary: '', commissionType: 'PERCENTAGE', commissionValue: '', defaultStartTime: '08:00', defaultEndTime: '18:00' });
      fetchMembers();
    } catch (e: any) { toast.error(e.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deseja desligar este funcionário?')) return;
    try {
      await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
      toast.success('Funcionário desligado');
      fetchMembers();
    } catch { toast.error('Erro ao desligar'); }
  };

  const filtered = members.filter(m =>
    m.user.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.user.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <BackButton />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2 mt-1">
            <Users className="h-7 w-7 text-blue-600" />
            Equipe / RH
          </h1>
          <p className="text-sm text-gray-500 mt-1">{members.length} funcionários cadastrados</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? 'Cancelar' : 'Novo Funcionário'}
        </Button>
      </div>

      {/* New member form */}
      {showForm && (
        <Card className="p-5 space-y-4 border-blue-200 bg-blue-50/50">
          <h3 className="font-semibold text-lg">Adicionar Funcionário</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="text-xs text-gray-600 block mb-1">Nome *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" /></div>
            <div><label className="text-xs text-gray-600 block mb-1">Email *</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" /></div>
            <div><label className="text-xs text-gray-600 block mb-1">Telefone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
            <div><label className="text-xs text-gray-600 block mb-1">CPF</label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Cargo</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.staffRole} onChange={(e) => setForm({ ...form, staffRole: e.target.value })}>
                <option value="COOK">Cozinheiro</option>
                <option value="CASHIER">Caixa</option>
                <option value="MANAGER">Gerente</option>
              </select>
            </div>
            <div><label className="text-xs text-gray-600 block mb-1">Salário Base (R$)</label><Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} placeholder="0.00" /></div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Tipo Comissão</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm" value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value })}>
                <option value="PERCENTAGE">Percentual</option>
                <option value="FIXED">Fixo</option>
                <option value="HYBRID">Híbrido</option>
              </select>
            </div>
            <div><label className="text-xs text-gray-600 block mb-1">Valor Comissão</label><Input type="number" value={form.commissionValue} onChange={(e) => setForm({ ...form, commissionValue: e.target.value })} placeholder="Ex: 5 (%)" /></div>
            <div className="flex gap-2">
              <div className="flex-1"><label className="text-xs text-gray-600 block mb-1">Entrada</label><Input type="time" value={form.defaultStartTime} onChange={(e) => setForm({ ...form, defaultStartTime: e.target.value })} /></div>
              <div className="flex-1"><label className="text-xs text-gray-600 block mb-1">Saída</label><Input type="time" value={form.defaultEndTime} onChange={(e) => setForm({ ...form, defaultEndTime: e.target.value })} /></div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar Funcionário'}
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input className="pl-10" placeholder="Buscar por nome ou email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Members list */}
      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">
            <Users className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p>Nenhum funcionário encontrado</p>
          </Card>
        ) : (
          filtered.map(member => {
            const st = STATUS_MAP[member.status] || STATUS_MAP.ACTIVE;
            return (
              <Card key={member.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{member.user.name || 'Sem nome'}</h3>
                      <Badge className={st.color}>{st.label}</Badge>
                      <Badge variant="outline">{ROLE_MAP[member.role] || member.role}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{member.user.email}</span>
                      {member.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{member.phone}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{member.defaultStartTime} - {member.defaultEndTime}</span>
                      {member.basesalary && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />R$ {Number(member.basesalary).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    </div>
                  </div>
                  {member.status !== 'TERMINATED' && (
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDeactivate(member.id)}>
                      Desligar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
