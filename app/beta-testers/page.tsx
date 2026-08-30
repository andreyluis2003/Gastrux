'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Plus, Search, MapPin, Users, CheckCircle, Clock, Star, Edit2, Lock, Unlock, Copy, KeyRound, CalendarPlus,
} from 'lucide-react';
import Link from 'next/link';

interface LinkedUser { id: string; active: boolean; email: string; name?: string | null; trialEndsAt?: string | null; }
interface BetaTester {
  id: string; name: string; email: string; phone?: string;
  restaurantName: string; restaurantCity: string; restaurantState: string;
  status: string; confirmedAt?: string; accessGrantedAt?: string; accessEndsAt?: string;
  weeklyMeetings: number; feedbackScore?: number; userId?: string | null; linkedUser?: LinkedUser | null;
  interactions: { type: string }[];
}

interface UserResult {
  id: string; email: string; name?: string | null; active: boolean; role: string;
  restaurant?: { id: string; name: string; city?: string | null; state?: string | null } | null;
}

const emptyForm = {
  name: '', email: '', phone: '',
  restaurantName: '', restaurantCity: '', restaurantState: 'SP',
  password: '', existingUserId: '' as string | '',
};

export default function BetaTestersPage() {
  const { data: session, status: authStatus } = useSession() || {};
  const router = useRouter();
  const [testers, setTesters] = useState<BetaTester[]>([]);
  const [filtered, setFiltered] = useState<BetaTester[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<BetaTester | null>(null);
  const [credentialsModal, setCredentialsModal] = useState<{ email: string; password: string } | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [editForm, setEditForm] = useState<any>({});
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchTesters = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const res = await fetch(`/api/admin/beta-testers?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTesters(data);
    } catch {
      toast.error('Erro ao carregar beta testers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    fetchTesters();
  }, [statusFilter, authStatus]);
  useEffect(() => {
    const term = search.toLowerCase();
    setFiltered(testers.filter(t =>
      t.name.toLowerCase().includes(term) ||
      t.email.toLowerCase().includes(term) ||
      t.restaurantName.toLowerCase().includes(term)
    ));
  }, [search, testers]);

  // Search clients while typing
  useEffect(() => {
    if (userQuery.length < 2) { setUserResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(userQuery)}`);
        if (res.ok) setUserResults(await res.json());
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [userQuery]);

  const pickExistingUser = (u: UserResult) => {
    setFormData(prev => ({
      ...prev,
      existingUserId: u.id,
      name: u.name || prev.name,
      email: u.email,
      restaurantName: u.restaurant?.name || prev.restaurantName,
      restaurantCity: u.restaurant?.city || prev.restaurantCity,
      restaurantState: u.restaurant?.state || prev.restaurantState,
    }));
    setUserQuery(`${u.name || ''} <${u.email}>`);
    setUserResults([]);
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.email || !formData.restaurantName || !formData.restaurantCity) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/beta-testers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, createAccess: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast.success('Acesso beta criado!');
      setShowNewDialog(false);
      setFormData(emptyForm);
      setUserQuery('');
      if (data.tempPassword) {
        setCredentialsModal({ email: data.email, password: data.tempPassword });
      }
      fetchTesters();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao criar acesso beta');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t: BetaTester) => { setEditForm({ ...t }); setShowEditDialog(t); };

  const handleEdit = async () => {
    try {
      const res = await fetch(`/api/admin/beta-testers/${showEditDialog!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error();
      toast.success('Cliente atualizado');
      setShowEditDialog(null);
      fetchTesters();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const accessAction = async (id: string, action: 'block' | 'unblock' | 'extend' | 'reset_password', days?: number) => {
    try {
      const res = await fetch(`/api/admin/beta-testers/${id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === 'reset_password' && data.tempPassword) {
        const t = testers.find(x => x.id === id);
        setCredentialsModal({ email: t?.email || '', password: data.tempPassword });
      } else {
        toast.success(data.message || 'OK');
      }
      fetchTesters();
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      prospect: 'bg-blue-100 text-blue-800',
      invited: 'bg-purple-100 text-purple-800',
      confirmed: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const stats = {
    active: testers.filter(t => t.status === 'active').length,
    confirmed: testers.filter(t => t.status === 'confirmed').length,
    total: testers.length,
  };

  const daysLeft = (date?: string) => {
    if (!date) return null;
    const ms = new Date(date).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Acessos Beta</h1>
            <p className="text-sm text-slate-600">Gerencie acessos de teste de 30 dias</p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800">
          <Plus className="mr-2 h-4 w-4" /> Novo Acesso Beta
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Total</p><p className="text-3xl font-bold text-blue-900">{stats.total}</p></div><Users className="h-8 w-8 text-blue-600" /></div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100">
          <div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Confirmados</p><p className="text-3xl font-bold text-yellow-900">{stats.confirmed}</p></div><CheckCircle className="h-8 w-8 text-yellow-600" /></div>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100">
          <div className="flex items-center justify-between"><div><p className="text-sm text-gray-600">Ativos</p><p className="text-3xl font-bold text-green-900">{stats.active}</p></div><Clock className="h-8 w-8 text-green-600" /></div>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <Input placeholder="Buscar por nome, email ou restaurante..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-lg">
          <option value="">Todos os Status</option>
          <option value="prospect">Prospect</option>
          <option value="invited">Convidado</option>
          <option value="confirmed">Confirmado</option>
          <option value="active">Ativo</option>
          <option value="completed">Completado</option>
          <option value="rejected">Rejeitado / Bloqueado</option>
        </select>
      </div>

      {/* New Access Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Novo Acesso Beta (30 dias)</h2>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Buscar cliente já cadastrado (opcional)</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input placeholder="Nome ou e-mail do cliente..." className="pl-9" value={userQuery} onChange={(e) => { setUserQuery(e.target.value); setFormData(prev => ({ ...prev, existingUserId: '' })); }} />
                {userResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {userResults.map(u => (
                      <button key={u.id} type="button" onClick={() => pickExistingUser(u)} className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b text-sm">
                        <div className="font-semibold">{u.name || u.email}</div>
                        <div className="text-xs text-gray-500">{u.email} {u.restaurant ? `· ${u.restaurant.name}` : ''}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {formData.existingUserId && <p className="text-xs text-green-700 mt-1">✓ Vinculado a cliente existente</p>}
            </div>

            <div className="space-y-3">
              <input type="text" placeholder="Nome *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              <input type="email" placeholder="Email *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <input type="tel" placeholder="Telefone" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <input type="text" placeholder="Nome do Restaurante *" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={formData.restaurantName} onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <input type="text" placeholder="Cidade *" className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg" value={formData.restaurantCity} onChange={(e) => setFormData({ ...formData, restaurantCity: e.target.value })} />
                <input type="text" placeholder="UF" maxLength={2} className="px-3 py-2 border border-gray-300 rounded-lg uppercase" value={formData.restaurantState} onChange={(e) => setFormData({ ...formData, restaurantState: e.target.value.toUpperCase() })} />
              </div>
              <input type="text" placeholder="Senha (deixe vazio para gerar)" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />

              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700">
                  {submitting ? 'Criando...' : 'Criar Acesso'}
                </Button>
                <Button onClick={() => { setShowNewDialog(false); setFormData(emptyForm); setUserQuery(''); }} variant="outline" className="flex-1">Cancelar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Editar Cliente Beta</h2>
            <div className="space-y-3">
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Nome" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Telefone" value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              <input className="w-full px-3 py-2 border rounded-lg" placeholder="Restaurante" value={editForm.restaurantName || ''} onChange={(e) => setEditForm({ ...editForm, restaurantName: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <input className="col-span-2 px-3 py-2 border rounded-lg" placeholder="Cidade" value={editForm.restaurantCity || ''} onChange={(e) => setEditForm({ ...editForm, restaurantCity: e.target.value })} />
                <input className="px-3 py-2 border rounded-lg uppercase" maxLength={2} placeholder="UF" value={editForm.restaurantState || ''} onChange={(e) => setEditForm({ ...editForm, restaurantState: e.target.value.toUpperCase() })} />
              </div>
              <select className="w-full px-3 py-2 border rounded-lg" value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="prospect">Prospect</option>
                <option value="invited">Convidado</option>
                <option value="confirmed">Confirmado</option>
                <option value="active">Ativo</option>
                <option value="completed">Completado</option>
                <option value="rejected">Rejeitado</option>
              </select>
              <div className="flex gap-2">
                <Button onClick={handleEdit} className="flex-1 bg-green-600 hover:bg-green-700">Salvar</Button>
                <Button onClick={() => setShowEditDialog(null)} variant="outline" className="flex-1">Cancelar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Credentials Modal */}
      {credentialsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-3 text-green-700">Credenciais de Acesso</h2>
            <p className="text-sm text-gray-700 mb-3">Compartilhe estas credenciais com o cliente. A senha não poderá ser visualizada novamente.</p>
            <div className="bg-gray-50 border rounded-lg p-3 space-y-2 font-mono text-sm">
              <div><span className="text-gray-500">Email:</span> {credentialsModal.email}</div>
              <div><span className="text-gray-500">Senha:</span> {credentialsModal.password}</div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => { navigator.clipboard.writeText(`Email: ${credentialsModal.email}\nSenha: ${credentialsModal.password}`); toast.success('Copiado'); }} className="flex-1">
                <Copy className="h-4 w-4 mr-2" /> Copiar
              </Button>
              <Button onClick={() => setCredentialsModal(null)} variant="outline" className="flex-1">Fechar</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-4">
        {loading ? (
          <div>Carregando...</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhum acesso beta encontrado</Card>
        ) : (
          filtered.map(tester => {
            const blocked = tester.linkedUser && tester.linkedUser.active === false;
            const remaining = daysLeft(tester.accessEndsAt);
            return (
              <Card key={tester.id} className="p-4 hover:shadow-lg transition">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <Link href={`/beta-testers/${tester.id}`} className="flex-1">
                    <h3 className="font-bold text-lg">{tester.name}</h3>
                    <div className="flex flex-col gap-1 text-sm text-gray-600 mt-2">
                      <div className="flex items-center gap-2"><MapPin className="h-4 w-4" />{tester.restaurantName} - {tester.restaurantCity}, {tester.restaurantState}</div>
                      <div>{tester.email}</div>
                      {tester.phone && <div>{tester.phone}</div>}
                      {tester.accessEndsAt && (
                        <div className="text-xs">
                          {blocked ? <span className="text-red-600 font-semibold">🔒 Bloqueado</span>
                            : remaining === 0 ? <span className="text-red-600 font-semibold">Acesso expirado</span>
                            : <span className="text-green-700">{remaining} dia(s) restantes</span>}
                          {' · expira em '}{new Date(tester.accessEndsAt).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(tester.status)}`}>{tester.status}</span>
                    {tester.feedbackScore && <div className="flex items-center gap-1 text-sm text-gray-600"><Star className="h-4 w-4 fill-yellow-400" />{tester.feedbackScore}/5</div>}
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(tester)}><Edit2 className="h-3 w-3 mr-1" />Editar</Button>
                      {tester.userId && (
                        <>
                          {blocked ? (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => accessAction(tester.id, 'unblock')}><Unlock className="h-3 w-3 mr-1" />Desbloquear</Button>
                          ) : (
                            <Button size="sm" variant="destructive" onClick={() => accessAction(tester.id, 'block')}><Lock className="h-3 w-3 mr-1" />Bloquear</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => accessAction(tester.id, 'extend', 30)}><CalendarPlus className="h-3 w-3 mr-1" />+30d</Button>
                          <Button size="sm" variant="outline" onClick={() => accessAction(tester.id, 'reset_password')}><KeyRound className="h-3 w-3 mr-1" />Senha</Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
