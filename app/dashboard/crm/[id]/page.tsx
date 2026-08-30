'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Mail, Phone, MapPin, Wallet, Plus, MessageSquare, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatBRL } from '@/lib/formatters';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  segment?: string;
  status: string;
  // Prisma Decimal fields serialize to strings over JSON
  totalSpent: number | string;
  totalOrders: number;
  averageTicket: number | string;
  lastOrderAt?: string;
  loyaltyAccounts: any[];
  interactions: any[];
  orders: any[];
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interaction, setInteraction] = useState({
    type: 'COMMENT',
    subject: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchCustomer = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/customers/${customerId}`);
        if (!response.ok) throw new Error('Failed to fetch customer');

        const data = await response.json();
        setCustomer(data);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao carregar dados do cliente');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomer();
  }, [customerId]);

  const handleAddInteraction = async () => {
    if (!interaction.subject) {
      toast.error('Assunto é obrigatório');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`/api/customers/${customerId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interaction),
      });

      if (!response.ok) throw new Error('Failed to create interaction');

      toast.success('Interação criada com sucesso!');
      setShowInteractionForm(false);
      setInteraction({ type: 'COMMENT', subject: '', notes: '' });

      // Refetch customer
      const customerResponse = await fetch(`/api/customers/${customerId}`);
      const updatedCustomer = await customerResponse.json();
      setCustomer(updatedCustomer);
    } catch (error: any) {
      toast.error('Erro ao criar interação');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <BackButton />
        <div className="mt-4 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="h-24 animate-pulse bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6">
        <BackButton />
        <Card className="mt-4 p-8 text-center">
          <p className="text-gray-500">Cliente não encontrado</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="mb-8">
        <BackButton />
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{customer.name}</h1>
        <p className="text-sm text-gray-600">Detalhes do cliente e histórico</p>
      </div>

      {/* Customer Info */}
      <Card className="border-l-4 border-l-blue-500 p-6">
        <h2 className="mb-4 text-xl font-semibold">Informações Pessoais</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500 uppercase">Email</p>
              <p className="font-medium">{customer.email}</p>
            </div>
          </div>
          {customer.phone && (
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 uppercase">Telefone</p>
                <p className="font-medium">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.city && (
            <div className="flex items-start gap-3 sm:col-span-2">
              <MapPin className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500 uppercase">Localização</p>
                <p className="font-medium">
                  {customer.city}, {customer.state}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Customer Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6">
          <p className="text-xs text-gray-500 uppercase">Total Gasto</p>
          <p className="text-2xl font-bold">{formatBRL(customer.totalSpent)}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs text-gray-500 uppercase">Total de Pedidos</p>
          <p className="text-2xl font-bold">{customer.totalOrders}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs text-gray-500 uppercase">Ticket Médio</p>
          <p className="text-2xl font-bold">{formatBRL(customer.averageTicket)}</p>
        </Card>
        <Card className="p-6">
          <p className="text-xs text-gray-500 uppercase">Segmento</p>
          <p className="text-2xl font-bold">{customer.segment || 'N/A'}</p>
        </Card>
      </div>

      {/* Loyalty Account */}
      {customer.loyaltyAccounts.length > 0 && (
        <Card className="border-l-4 border-l-purple-500 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Conta de Fidelização</h2>
            <Link href={`/dashboard/loyalty/customer/${customerId}`}>
              <Button variant="outline" size="sm">
                Ver Detalhes
              </Button>
            </Link>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {customer.loyaltyAccounts.map((account) => (
              <div key={account.id} className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <p className="text-sm font-medium text-gray-600">{account.program.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                  <p className="text-2xl font-bold text-purple-900">{account.currentPoints}</p>
                  <span className="text-sm text-gray-600">pontos</span>
                </div>
                <p className="mt-1 text-xs text-gray-600">Tier: {account.tier}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Interactions */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Interações</h2>
          <Button onClick={() => setShowInteractionForm(!showInteractionForm)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Interação
          </Button>
        </div>

        {showInteractionForm && (
          <div className="mt-4 space-y-3 border-t pt-4">
            <select
              value={interaction.type}
              onChange={(e) => setInteraction({ ...interaction, type: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Tipo de interação"
            >
              <option value="CALL">Chamada</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="IN_PERSON">Presencial</option>
              <option value="COMMENT">Comentário</option>
            </select>
            <input
              type="text"
              placeholder="Assunto"
              value={interaction.subject}
              onChange={(e) => setInteraction({ ...interaction, subject: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Assunto da interação"
            />
            <textarea
              placeholder="Notas"
              value={interaction.notes}
              onChange={(e) => setInteraction({ ...interaction, notes: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              rows={3}
              aria-label="Notas da interação"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddInteraction} disabled={submitting} className="flex-1">
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button onClick={() => setShowInteractionForm(false)} variant="outline" className="flex-1">
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {customer.interactions.length === 0 ? (
          <p className="mt-4 text-gray-500">Nenhuma interação registrada</p>
        ) : (
          <div className="mt-4 space-y-3">
            {customer.interactions.map((inter) => (
              <div key={inter.id} className="border-l-4 border-l-gray-200 bg-gray-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{inter.subject}</p>
                    <p className="text-xs text-gray-500">{inter.type} - {new Date(inter.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-800">
                    {inter.status}
                  </span>
                </div>
                {inter.notes && <p className="mt-2 text-sm text-gray-600">{inter.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
