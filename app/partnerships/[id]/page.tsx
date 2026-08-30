'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Mail, LinkedinIcon, Phone, Calendar, Edit2, Plus, MessageSquare, Briefcase } from 'lucide-react';

interface PartnershipContact {
  id: string;
  companyName: string;
  contactType: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  status: string;
  notes?: string;
  lastContactDate?: string;
  nextFollowUp?: string;
  communications: any[];
  deals: any[];
}

export default function PartnershipDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [contact, setContact] = useState<PartnershipContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [showNewComm, setShowNewComm] = useState(false);
  const [commData, setCommData] = useState({
    type: 'email',
    subject: '',
    message: '',
  });

  const fetchContact = async () => {
    try {
      const res = await fetch(`/api/admin/partnerships/contacts/${params.id}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setContact(data);
      setEditData(data);
    } catch {
      toast.error('Erro ao carregar contato');
      router.push('/partnerships');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContact();
  }, [params.id]);

  const handleUpdate = async () => {
    try {
      const res = await fetch(`/api/admin/partnerships/contacts/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Contato atualizado!');
      setEditMode(false);
      fetchContact();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const handleAddCommunication = async () => {
    if (!commData.message) {
      toast.error('Mensagem é obrigatória');
      return;
    }

    try {
      const res = await fetch('/api/admin/partnerships/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: params.id,
          ...commData,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Comunicação registrada!');
      setShowNewComm(false);
      setCommData({ type: 'email', subject: '', message: '' });
      fetchContact();
    } catch {
      toast.error('Erro ao registrar comunicação');
    }
  };

  if (loading) return <div>Carregando...</div>;
  if (!contact) return <div>Contato não encontrado</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <BackButton />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{contact.companyName}</h1>
          <p className="text-sm text-gray-600">{contact.contactType}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informações Principais */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg">Informações</h2>
              <Button
                size="sm"
                onClick={() => setEditMode(!editMode)}
                className="gap-2"
              >
                <Edit2 className="h-4 w-4" />
                {editMode ? 'Cancelar' : 'Editar'}
              </Button>
            </div>

            {editMode ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={editData.companyName}
                  onChange={(e) => setEditData({ ...editData, companyName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Empresa"
                />
                <input
                  type="text"
                  value={editData.contactPerson}
                  onChange={(e) => setEditData({ ...editData, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Pessoa de Contato"
                />
                <input
                  type="email"
                  value={editData.email}
                  onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Email"
                />
                <input
                  type="tel"
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Telefone"
                />
                <select
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="prospect">Prospect</option>
                  <option value="contacted">Contatado</option>
                  <option value="interested">Interessado</option>
                  <option value="negotiating">Negociando</option>
                  <option value="partner">Partner</option>
                  <option value="rejected">Rejeitado</option>
                </select>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Notas"
                  rows={4}
                />
                <Button onClick={handleUpdate} className="w-full bg-green-600 hover:bg-green-700">
                  Salvar Mudanças
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {contact.contactPerson && (
                  <div><span className="font-semibold">Contato:</span> {contact.contactPerson}</div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a>
                </div>
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a>
                  </div>
                )}
                {contact.linkedinUrl && (
                  <div className="flex items-center gap-2">
                    <LinkedinIcon className="h-4 w-4" />
                    <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      LinkedIn
                    </a>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <span className="font-semibold">Status:</span>
                  <div className="mt-1 px-2 py-1 bg-blue-100 text-blue-800 rounded w-fit text-xs font-medium">
                    {contact.status}
                  </div>
                </div>
                {contact.notes && (
                  <div>
                    <span className="font-semibold">Notas:</span>
                    <p className="text-gray-700 mt-1">{contact.notes}</p>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Comunicações e Deals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Communications */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Histórico de Comunicações
              </h2>
              <Button
                size="sm"
                onClick={() => setShowNewComm(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {showNewComm && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-3">
                <select
                  value={commData.type}
                  onChange={(e) => setCommData({ ...commData, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="email">Email</option>
                  <option value="linkedin_message">LinkedIn</option>
                  <option value="call">Chamada</option>
                  <option value="meeting">Reunião</option>
                  <option value="proposal">Proposta</option>
                </select>
                {commData.type === 'email' && (
                  <input
                    type="text"
                    placeholder="Assunto"
                    className="w-full px-3 py-2 border rounded-lg"
                    value={commData.subject}
                    onChange={(e) => setCommData({ ...commData, subject: e.target.value })}
                  />
                )}
                <textarea
                  placeholder="Mensagem/Notas"
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  value={commData.message}
                  onChange={(e) => setCommData({ ...commData, message: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button onClick={handleAddCommunication} className="flex-1 bg-green-600 hover:bg-green-700">
                    Registrar
                  </Button>
                  <Button onClick={() => setShowNewComm(false)} variant="outline" className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {contact.communications.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma comunicação registrada</p>
              ) : (
                contact.communications.map(comm => (
                  <div key={comm.id} className="border-l-4 border-blue-400 pl-3 py-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{comm.type}</p>
                        {comm.subject && <p className="text-sm">{comm.subject}</p>}
                        <p className="text-gray-700 text-sm mt-1">{comm.message}</p>
                      </div>
                      {comm.outcome && (
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">{comm.outcome}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(comm.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Deals */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Deals e Propostas ({contact.deals.length})
              </h2>
              <Button
                size="sm"
                onClick={() => router.push(`/partnerships/${params.id}/deals/new`)}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4" />
                Novo Deal
              </Button>
            </div>

            <div className="space-y-3">
              {contact.deals.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhum deal criado</p>
              ) : (
                contact.deals.map(deal => (
                  <div key={deal.id} className="border rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{deal.title}</p>
                        <p className="text-sm text-gray-600">{deal.proposalType}</p>
                        <p className="text-sm text-gray-700 mt-1">{deal.description}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        deal.status === 'accepted' ? 'bg-green-100 text-green-800' :
                        deal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {deal.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
