'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Users, Send, TrendingUp, DollarSign, Phone, MessageSquare,
  Loader2, CheckCircle, Target, ArrowRight, Megaphone, Search,
  ChevronDown, ChevronUp, Filter
} from 'lucide-react';

export default function CampanhaReconquista() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [showCreatePanel, setShowCreatePanel] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/campanha-reconquista');
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch { toast.error('Erro ao carregar dados'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredCustomers = (data?.deliveryCustomers || []).filter((c: any) =>
    !searchTerm || c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  const displayedCustomers = showAll ? filteredCustomers : filteredCustomers.slice(0, 20);

  function toggleCustomer(phone: string) {
    const newSet = new Set(selectedCustomers);
    if (newSet.has(phone)) newSet.delete(phone);
    else newSet.add(phone);
    setSelectedCustomers(newSet);
  }

  function selectAll() {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map((c: any) => c.phone)));
    }
  }

  async function createCampaign() {
    if (!campaignName.trim()) { toast.error('Informe o nome da campanha'); return; }
    if (selectedCustomers.size === 0) { toast.error('Selecione pelo menos 1 cliente'); return; }

    setCreating(true);
    try {
      const phones = filteredCustomers
        .filter((c: any) => selectedCustomers.has(c.phone))
        .map((c: any) => ({ phone: c.phone, name: c.name }));

      // For now we reference the first available template or create a placeholder
      const res = await fetch('/api/admin/campanha-reconquista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName,
          templateId: 'reconquista_default',
          recipientPhones: phones,
          provider: 'META_CLOUD',
        }),
      });

      if (res.ok) {
        toast.success(`Campanha criada com ${phones.length} destinatários!`);
        setShowCreatePanel(false);
        setCampaignName('');
        setSelectedCustomers(new Set());
        loadData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Erro ao criar campanha');
      }
    } catch { toast.error('Erro ao criar campanha'); }
    setCreating(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-7 h-7 text-orange-500" />
              Campanha Reconquista
            </h1>
            <p className="text-sm text-muted-foreground">Reconquiste clientes do iFood para pedido direto via WhatsApp</p>
          </div>
        </div>
        <Button
          onClick={() => setShowCreatePanel(!showCreatePanel)}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Send className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Clientes Delivery</p>
              <p className="text-xl font-bold">{summary.totalDeliveryCustomers || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Clientes iFood</p>
              <p className="text-xl font-bold">{summary.ifoodCustomers || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Receita em Risco</p>
              <p className="text-lg font-bold">R$ {Number(summary.totalRevenueAtRisk || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Campanhas Lançadas</p>
              <p className="text-xl font-bold">{summary.campaignsLaunched || 0}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Create Campaign Panel */}
      {showCreatePanel && (
        <Card className="p-6 border-orange-200 dark:border-orange-800">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Send className="w-5 h-5 text-orange-500" />
            Criar Campanha de Reconquista
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da Campanha</label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ex: Reconquista Junho 2026"
                className="mt-1"
              />
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-2">📩 Mensagem Sugerida:</h3>
              <p className="text-sm text-muted-foreground italic">
                "Olá {'{{nome}}'}, sentimos sua falta! 😊 Peça diretamente pelo nosso cardápio digital e ganhe desconto exclusivo no próximo pedido. Clique aqui: {'{{link}}'}"
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ⚠️ Para envio efetivo, configure um template aprovado em Mensageria {'->'} Templates
              </p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedCustomers.size} clientes selecionados
              </span>
              <Button
                onClick={createCampaign}
                disabled={creating || selectedCustomers.size === 0}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Criar Campanha
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Delivery Customers List */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="w-5 h-5 text-orange-500" />
            Clientes Delivery (Reconquistáveis)
          </h2>
          {showCreatePanel && (
            <Button variant="outline" size="sm" onClick={selectAll}>
              {selectedCustomers.size === filteredCustomers.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </Button>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-10"
          />
        </div>

        {displayedCustomers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum cliente delivery encontrado</p>
            <p className="text-sm">Integre com iFood para importar clientes</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    {showCreatePanel && <th className="py-2 px-2 w-8"></th>}
                    <th className="py-2 px-2">Cliente</th>
                    <th className="py-2 px-2">Telefone</th>
                    <th className="py-2 px-2">Plataforma</th>
                    <th className="py-2 px-2 text-right">Pedidos</th>
                    <th className="py-2 px-2 text-right">Total Gasto</th>
                    <th className="py-2 px-2">Último Pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCustomers.map((c: any, i: number) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      {showCreatePanel && (
                        <td className="py-2 px-2">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.has(c.phone)}
                            onChange={() => toggleCustomer(c.phone)}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="py-2 px-2 font-medium">{c.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{c.phone}</td>
                      <td className="py-2 px-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.platform === 'ifood' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          c.platform === 'uber_eats' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {c.platform === 'ifood' ? 'iFood' : c.platform === 'uber_eats' ? 'Uber Eats' : 'Rappi'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{c.totalOrders}</td>
                      <td className="py-2 px-2 text-right">R$ {Number(c.totalSpent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-2 text-muted-foreground text-xs">
                        {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('pt-BR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCustomers.length > 20 && (
              <div className="text-center mt-4">
                <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)} className="gap-1">
                  {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showAll ? 'Mostrar menos' : `Ver todos (${filteredCustomers.length})`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Past Campaigns */}
      {(data?.campaigns?.length || 0) > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-orange-500" />
            Campanhas Anteriores
          </h2>
          <div className="space-y-3">
            {data.campaigns.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c._count?.recipients || 0} destinatários • {c.template?.displayName || 'Template'}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  c.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  c.status === 'DRAFT' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' :
                  c.status === 'SENDING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}>
                  {c.status === 'DRAFT' ? 'Rascunho' : c.status === 'SENDING' ? 'Enviando' : c.status === 'COMPLETED' ? 'Concluída' : c.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
