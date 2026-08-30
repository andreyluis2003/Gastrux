'use client';

import { useState, useEffect } from 'react';
import { Button, Card, BackButton, LoadingSkeleton } from '@/components/ui';
import { Copy, Mail, Phone, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface WarmLead {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  willingnessToPayBRL: number;
  willingnessToPayRaw: string;
  mostImportantFeature: string;
  painPoints: string[];
  businessUnits: string;
  monthlyRevenue: string;
  preferredContact: string;
  contactInfo: string;
  followUpSentAt: string | null;
  completedAt: string;
}

export default function SurveyLeadsPage() {
  const [leads, setLeads] = useState<WarmLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/survey/warm-leads');
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (error) {
      toast.error('Erro ao carregar warm leads');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${type} copiado!`);
  };

  const sendFollowUp = async (leadId: string) => {
    setSending(leadId);
    try {
      const res = await fetch(`/api/survey/send-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surveyResponseId: leadId }),
      });

      if (res.ok) {
        toast.success('Follow-up enviado com sucesso!');
        await fetchLeads();
      } else {
        toast.error('Erro ao enviar follow-up');
      }
    } catch (error) {
      toast.error('Erro ao enviar follow-up');
    } finally {
      setSending(null);
    }
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4 sm:space-y-6 sm:p-6">
      <div>
        <BackButton href="/dashboard/survey-analytics" label="Voltar aos Analytics" />
        <h1 className="text-3xl font-bold text-gray-900 mt-4">Warm Leads</h1>
        <p className="text-sm text-gray-600 mt-1">Usuários interessados em falar sobre solução ({leads.length})</p>
      </div>

      {leads.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-600">Nenhum warm lead ainda</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <Card key={lead.id} className="p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Column 1: Contato */}
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">{lead.user.name || 'Sem nome'}</h3>
                  <p className="text-sm text-gray-600 mt-1">{lead.user.email}</p>

                  <div className="space-y-2 mt-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{lead.user.email}</span>
                      <button
                        onClick={() => copyToClipboard(lead.user.email, 'Email')}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>

                    {lead.preferredContact === 'whatsapp' && lead.contactInfo && (
                      <div className="flex items-center gap-2 text-green-600">
                        <span className="text-lg">💬</span>
                        <span className="text-sm font-medium">{lead.contactInfo}</span>
                        <button
                          onClick={() => copyToClipboard(lead.contactInfo, 'WhatsApp')}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {lead.preferredContact === 'phone' && lead.contactInfo && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <Phone className="w-4 h-4" />
                        <span className="text-sm font-medium">{lead.contactInfo}</span>
                        <button
                          onClick={() => copyToClipboard(lead.contactInfo, 'Telefone')}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {lead.followUpSentAt && (
                    <div className="mt-4 flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs">Follow-up enviado</span>
                    </div>
                  )}
                </div>

                {/* Column 2: Dados do Survey */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">WTP</p>
                    <p className="text-2xl font-bold text-gray-900">R$ {(lead.willingnessToPayBRL / 100).toFixed(0)}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Feature Priority</p>
                    <p className="text-sm text-gray-900">{lead.mostImportantFeature || 'Não informado'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Négócio</p>
                    <div className="text-sm text-gray-700 space-y-1 mt-1">
                      <p>🏢 {lead.businessUnits} unidades</p>
                      <p>💵 {lead.monthlyRevenue}</p>
                    </div>
                  </div>
                </div>

                {/* Column 3: Ações */}
                <div className="flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pain Points Mencionados</p>
                    <div className="flex flex-wrap gap-1">
                      {(lead.painPoints || []).slice(0, 3).map((pain) => (
                        <span key={pain} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          {pain}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    {!lead.followUpSentAt && (
                      <Button
                        onClick={() => sendFollowUp(lead.id)}
                        disabled={sending === lead.id}
                        className="flex-1 flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {sending === lead.id ? 'Enviando...' : 'Enviar Follow-up'}
                      </Button>
                    )}

                    {lead.preferredContact === 'whatsapp' && lead.contactInfo && (
                      <a
                        href={`https://wa.me/55${lead.contactInfo.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-700 p-2 border border-green-200 rounded hover:bg-green-50 transition"
                        title="Abrir no WhatsApp"
                      >
                        <span className="text-lg">💬</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
