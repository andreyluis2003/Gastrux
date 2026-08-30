'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Search, Mail, LinkedinIcon, Phone, Calendar, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface PartnershipContact {
  id: string;
  companyName: string;
  contactType: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  status: string;
  lastContactDate?: string;
  nextFollowUp?: string;
  deals: { status: string }[];
}

export default function PartnershipsPage() {
  const { data: session, status: authStatus } = useSession() || {};
  const router = useRouter();
  const [contacts, setContacts] = useState<PartnershipContact[]>([]);
  const [filtered, setFiltered] = useState<PartnershipContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    contactType: 'delivery_platform',
    contactPerson: '',
    email: '',
    phone: '',
    linkedinUrl: '',
  });

  const fetchContacts = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      
      const res = await fetch(`/api/admin/partnerships/contacts?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setContacts(data);
      applyFilters(data, search);
    } catch (error) {
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data: PartnershipContact[], searchTerm: string) => {
    const filtered = data.filter(c =>
      c.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFiltered(filtered);
  };

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    fetchContacts();
  }, [statusFilter, authStatus]);

  useEffect(() => {
    applyFilters(contacts, search);
  }, [search, contacts]);

  const handleCreate = async () => {
    if (!formData.companyName || !formData.email) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      const res = await fetch('/api/admin/partnerships/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed');
      toast.success('Contato criado com sucesso!');
      setShowNewDialog(false);
      setFormData({ companyName: '', contactType: 'delivery_platform', contactPerson: '', email: '', phone: '', linkedinUrl: '' });
      fetchContacts();
    } catch {
      toast.error('Erro ao criar contato');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      prospect: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      interested: 'bg-orange-100 text-orange-800',
      negotiating: 'bg-purple-100 text-purple-800',
      partner: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-slate-900">Partnership Outreach</h1>
            <p className="text-sm text-slate-600">Gerencie contatos e negociações com plataformas</p>
          </div>
        </div>
        <Button onClick={() => setShowNewDialog(true)} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
          <Plus className="mr-2 h-4 w-4" /> Novo Contato
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
          <Input
            placeholder="Buscar por empresa ou email..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="">Todos os Status</option>
          <option value="prospect">Prospect</option>
          <option value="contacted">Contatado</option>
          <option value="interested">Interessado</option>
          <option value="negotiating">Negociando</option>
          <option value="partner">Partner</option>
          <option value="rejected">Rejeitado</option>
        </select>
      </div>

      {/* Nova Dialog */}
      {showNewDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Novo Contato de Partnership</h2>
            <input
              type="text"
              placeholder="Nome da Empresa"
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
            <select
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.contactType}
              onChange={(e) => setFormData({ ...formData, contactType: e.target.value })}
            >
              <option value="delivery_platform">Plataforma de Delivery</option>
              <option value="payment_provider">Provedor de Pagamento</option>
              <option value="other">Outro</option>
            </select>
            <input
              type="text"
              placeholder="Nome do Contato (opcional)"
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            />
            <input
              type="email"
              placeholder="Email"
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <input
              type="tel"
              placeholder="Telefone (opcional)"
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <input
              type="url"
              placeholder="LinkedIn (opcional)"
              className="w-full mb-4 px-3 py-2 border border-gray-300 rounded-lg"
              value={formData.linkedinUrl}
              onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
            />
            <div className="flex gap-2">
              <Button onClick={handleCreate} className="flex-1 bg-blue-600 hover:bg-blue-700">Criar</Button>
              <Button onClick={() => setShowNewDialog(false)} variant="outline" className="flex-1">Cancelar</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Lista de Contatos */}
      <div className="space-y-4">
        {loading ? (
          <div>Carregando...</div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-gray-500">Nenhum contato encontrado</Card>
        ) : (
          filtered.map(contact => (
            <Link key={contact.id} href={`/partnerships/${contact.id}`}>
              <Card className="p-4 hover:shadow-lg transition cursor-pointer">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{contact.companyName}</h3>
                    <div className="flex flex-col gap-1 text-sm text-gray-600 mt-2">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {contact.email}
                      </div>
                      {contact.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          {contact.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(contact.status)}`}>
                      {contact.status}
                    </span>
                    {contact.deals?.length > 0 && (
                      <div className="flex items-center gap-1 text-blue-600 text-sm">
                        <TrendingUp className="h-4 w-4" />
                        {contact.deals.length} deal(s)
                      </div>
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
