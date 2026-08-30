'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Plus, Search, Mail, Phone, Wallet, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { formatBRL } from '@/lib/formatters';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  segment?: string;
  status: string;
  // Prisma Decimal fields serialize to strings over JSON
  totalSpent: number | string;
  totalOrders: number;
  lastOrderAt?: Date;
  loyaltyAccounts: any[];
}

export default function CRMPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (segment) params.append('segment', segment);

      const response = await fetch(`/api/customers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch customers');

      const data = await response.json();
      setCustomers(data.customers);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name || !newCustomer.email) {
      toast.error('Nome e email são obrigatórios');
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      toast.success('Cliente criado com sucesso!');
      setShowNewDialog(false);
      setNewCustomer({ name: '', email: '', phone: '', city: '', state: '' });
      await fetchCustomers();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const segmentColors: { [key: string]: string } = {
    VIP: 'bg-purple-100 text-purple-800',
    REGULAR: 'bg-blue-100 text-blue-800',
    OCCASIONAL: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <BackButton />
          <h1 className="text-xl font-bold sm:text-3xl">CRM - Gestão de Clientes</h1>
          <p className="text-sm text-gray-600">Gerencie clientes e interações</p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="w-full gap-2 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Buscar cliente"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
            aria-label="Buscar clientes"
          />
        </div>
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2"
          aria-label="Filtrar por segmento"
        >
          <option value="">Todos os segmentos</option>
          <option value="VIP">VIP</option>
          <option value="REGULAR">Regular</option>
          <option value="OCCASIONAL">Ocasional</option>
        </select>
      </div>

      {/* New Customer Dialog */}
      {showNewDialog && (
        <Card className="border border-blue-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Novo Cliente</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Nome completo"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Nome do cliente"
            />
            <input
              type="email"
              placeholder="Email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Email do cliente"
            />
            <input
              type="tel"
              placeholder="Telefone"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Telefone do cliente"
            />
            <input
              type="text"
              placeholder="Cidade"
              value={newCustomer.city}
              onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
              aria-label="Cidade do cliente"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleCreateCustomer}
                disabled={creating}
                className="flex-1"
              >
                {creating ? 'Criando...' : 'Criar'}
              </Button>
              <Button
                onClick={() => setShowNewDialog(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Customers List */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Card key={i} className="h-24 animate-pulse bg-gray-200" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Nenhum cliente encontrado</p>
          </Card>
        ) : (
          customers.map((customer) => (
            <Link key={customer.id} href={`/dashboard/crm/${customer.id}`}>
              <Card className="cursor-pointer p-4 transition-all hover:shadow-lg sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{customer.name}</h3>
                      {customer.segment && (
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            segmentColors[customer.segment] || 'bg-gray-100'
                          }`}
                        >
                          {customer.segment}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:gap-4">
                      <div className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {customer.email}
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          {customer.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-right sm:gap-1">
                    <div className="flex items-center gap-1 justify-end text-lg font-semibold">
                      <Wallet className="h-5 w-5" />
                      {formatBRL(customer.totalSpent)}
                    </div>
                    <p className="text-sm text-gray-600">{customer.totalOrders} pedidos</p>
                    {customer.loyaltyAccounts?.length > 0 && (
                      <p className="text-xs text-purple-600 flex items-center justify-end gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {customer.loyaltyAccounts[0]?.currentPoints || 0} pontos
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
