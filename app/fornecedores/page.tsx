'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { Plus, Search, Truck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function FornecedoresPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    code: '',
    name: '',
    cnpj: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const filtered = suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code?.toLowerCase().includes(search.toLowerCase())
    );
    setFiltered(filtered);
  }, [search, suppliers]);

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/suppliers');
      if (!res.ok) throw new Error('Erro ao buscar fornecedores');
      const data = await res.json();
      setSuppliers(data);
    } catch (error) {
      toast.error('Erro ao carregar fornecedores');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSupplier(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier),
      });

      if (!res.ok) throw new Error('Erro ao criar fornecedor');
      
      await fetchSuppliers();
      setShowNewForm(false);
      setNewSupplier({ code: '', name: '', cnpj: '', email: '', phone: '' });
      toast.success('Fornecedor criado com sucesso!');
    } catch (error) {
      toast.error('Erro ao criar fornecedor');
    }
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/dashboard" label="Voltar" />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Fornecedores</h1>
            <p className="text-slate-600">Gestão de fornecedores e integrações</p>
          </div>
        </div>
        <Button onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fornecedor
        </Button>
      </div>

      {showNewForm && (
        <Card className="p-6">
          <form onSubmit={handleCreateSupplier} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Código"
                value={newSupplier.code}
                onChange={(e) => setNewSupplier({ ...newSupplier, code: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
                required
              />
              <input
                type="text"
                placeholder="Nome"
                value={newSupplier.name}
                onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
                required
              />
              <input
                type="text"
                placeholder="CNPJ"
                value={newSupplier.cnpj}
                onChange={(e) => setNewSupplier({ ...newSupplier, cnpj: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
              />
              <input
                type="email"
                placeholder="Email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
              />
              <input
                type="tel"
                placeholder="Telefone"
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 dark:bg-slate-800 dark:border-slate-600"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Criar Fornecedor</Button>
              <Button type="button" variant="outline" onClick={() => setShowNewForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-32" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex h-40 flex-col items-center justify-center">
          <Truck className="mb-2 h-8 w-8 text-slate-400" />
          <p className="text-slate-600">Nenhum fornecedor encontrado</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filtered.map((supplier) => (
            <Link key={supplier.id} href={`/fornecedores/${supplier.id}`}>
              <Card className="cursor-pointer p-4 transition-all hover:shadow-lg">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{supplier.name}</h3>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    supplier.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {supplier.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{supplier.contactPerson || '-'}</p>
                <p className="text-xs text-slate-500 mt-2">{supplier.email || '-'}</p>
                {supplier.integrations?.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    ✓ {supplier.integrations.length} integração(ões)
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
