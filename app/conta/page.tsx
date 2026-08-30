// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  User, Lock, Users, Trash2, CreditCard, Loader2, Save,
  Shield, Crown, AlertTriangle, LogOut, Mail
} from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter (Grátis)',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  COOK: 'Cozinheiro',
  WAITER: 'Garçom',
  CASHIER: 'Caixa',
  SUPER_ADMIN: 'Super Admin',
};

export default function MinhaContaPage() {
  const { data: session } = useSession() || {};
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);

  // Profile form
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await fetch('/api/conta/profile');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfile(data.user);
      setTeam(data.team || []);
      setName(data.user.name || '');
    } catch {
      toast.error('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return; }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/conta/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_profile', name }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Perfil atualizado!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar perfil');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) { toast.error('Preencha todos os campos'); return; }
    if (newPassword.length < 6) { toast.error('Nova senha deve ter pelo menos 6 caracteres'); return; }
    if (newPassword !== confirmNewPassword) { toast.error('Senhas não coincidem'); return; }
    setSavingPassword(true);
    try {
      const res = await fetch('/api/conta/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', currentPassword, newPassword }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Senha alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar senha');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!confirm('Tem certeza que deseja remover este membro?')) return;
    try {
      const res = await fetch('/api/conta/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_member', memberId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Membro removido');
      setTeam(prev => prev.filter(m => m.id !== memberId));
    } catch (e: any) {
      toast.error(e.message || 'Erro');
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== 'EXCLUIR') { toast.error('Digite EXCLUIR para confirmar'); return; }
    setDeleting(true);
    try {
      const res = await fetch('/api/conta/profile', { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Conta desativada. Você será desconectado.');
      setTimeout(() => signOut({ callbackUrl: '/' }), 2000);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir conta');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-48 bg-gray-200 rounded" />
          <div className="h-48 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const isOwner = profile?.role === 'OWNER' || profile?.role === 'ADMIN';
  const trialDays = profile?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(profile.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Minha Conta</h1>
            <p className="text-sm text-gray-600">Gerencie seu perfil, senha e equipe</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Crown className="h-3 w-3 mr-1" />
            {TIER_LABELS[profile?.subscriptionTier] || profile?.subscriptionTier}
          </Badge>
          {trialDays !== null && trialDays > 0 && (
            <Badge variant="secondary" className="text-xs">
              Trial: {trialDays} dias
            </Badge>
          )}
        </div>
      </div>

      {/* Perfil */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Perfil</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-gray-50 text-sm text-gray-600">
              <Mail className="h-4 w-4" />
              {profile?.email}
            </div>
          </div>
          <div>
            <Label>Função</Label>
            <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-gray-50 text-sm">
              <Shield className="h-4 w-4 text-violet-600" />
              {ROLE_LABELS[profile?.role] || profile?.role}
            </div>
          </div>
          <div>
            <Label>Membro desde</Label>
            <div className="h-10 px-3 rounded-md border bg-gray-50 text-sm flex items-center text-gray-600">
              {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('pt-BR') : '—'}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar perfil
          </Button>
        </div>
      </Card>

      {/* Alterar Senha */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold">Alterar Senha</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="currentPw">Senha atual</Label>
            <Input id="currentPw" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="newPw">Nova senha</Label>
            <Input id="newPw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="confirmPw">Confirmar nova senha</Label>
            <Input id="confirmPw" type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={handleChangePassword} disabled={savingPassword} variant="outline">
            {savingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
            Alterar senha
          </Button>
        </div>
      </Card>

      {/* Equipe */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold">Equipe</h2>
            <Badge variant="secondary" className="text-xs">{team.length} membro{team.length !== 1 ? 's' : ''}</Badge>
          </div>
          {isOwner && (
            <Link href="/admin/users/new">
              <Button size="sm">Convidar membro</Button>
            </Link>
          )}
        </div>
        {team.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum membro na equipe ainda.</p>
        ) : (
          <div className="space-y-2">
            {team.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg border hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-semibold">
                    {(m.name || m.email)?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.name || m.email}</p>
                    <p className="text-xs text-gray-500">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {ROLE_LABELS[m.restaurantRole || m.role] || m.role}
                  </Badge>
                  {isOwner && m.id !== profile?.id && (
                    <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.id)} className="text-red-500 hover:text-red-700 h-7 w-7 p-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Cobrança */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Cobrança</h2>
          </div>
          <div className="flex gap-2">
            <Link href="/conta/cobranca">
              <Button variant="outline" size="sm">Ver faturas</Button>
            </Link>
            <Link href="/pricing">
              <Button size="sm">Alterar plano</Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Excluir Conta */}
      <Card className="p-6 border-red-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold text-red-700">Zona de Perigo</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Ao excluir sua conta, seus dados serão desativados imediatamente e removidos permanentemente após 30 dias, conforme nossa <Link href="/privacidade" className="text-blue-600 hover:underline">Política de Privacidade</Link>.
        </p>
        {!showDeleteConfirm ? (
          <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir minha conta
          </Button>
        ) : (
          <div className="space-y-3 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-800">Tem certeza? Esta ação é irreversível.</p>
            <p className="text-xs text-red-600">Digite <strong>EXCLUIR</strong> para confirmar:</p>
            <Input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              className="max-w-xs border-red-300"
            />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleting || deleteConfirmText !== 'EXCLUIR'}>
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Confirmar exclusão
              </Button>
              <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Sair */}
      <div className="flex justify-center pb-8">
        <Button variant="ghost" className="text-gray-500" onClick={() => signOut({ callbackUrl: '/' })}>
          <LogOut className="h-4 w-4 mr-2" />
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
