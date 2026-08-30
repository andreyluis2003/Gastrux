'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { Mail, Phone, MapPin, Edit2, Plus, MessageSquare, Calendar, Star } from 'lucide-react';

interface BetaTester {
  id: string;
  name: string;
  email: string;
  phone?: string;
  restaurantName: string;
  restaurantCity: string;
  restaurantState: string;
  status: string;
  confirmedAt?: string;
  accessGrantedAt?: string;
  accessEndsAt?: string;
  feedbackNotes?: string;
  feedbackScore?: number;
  weeklyMeetings: number;
  interactions: any[];
}

export default function BetaTesterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [tester, setTester] = useState<BetaTester | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [showNewInteraction, setShowNewInteraction] = useState(false);
  const [interactionData, setInteractionData] = useState({
    type: 'weekly_meeting',
    title: '',
    notes: '',
    rating: 5,
  });

  const fetchTester = async () => {
    try {
      const res = await fetch(`/api/admin/beta-testers/${params.id}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setTester(data);
      setEditData(data);
    } catch {
      toast.error('Erro ao carregar beta tester');
      router.push('/beta-testers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTester();
  }, [params.id]);

  const handleUpdate = async () => {
    try {
      const res = await fetch(`/api/admin/beta-testers/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Beta tester atualizado!');
      setEditMode(false);
      fetchTester();
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  const handleAddInteraction = async () => {
    if (!interactionData.title || !interactionData.notes) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    try {
      const res = await fetch(`/api/admin/beta-testers/${params.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interactionData),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Interação registrada!');
      setShowNewInteraction(false);
      setInteractionData({ type: 'weekly_meeting', title: '', notes: '', rating: 5 });
      fetchTester();
    } catch {
      toast.error('Erro ao registrar interação');
    }
  };

  if (loading) return <div>Carregando...</div>;
  if (!tester) return <div>Beta tester não encontrado</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:space-y-6 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <BackButton />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{tester.name}</h1>
          <p className="text-sm text-gray-600">{tester.restaurantName}</p>
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
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Nome"
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
                  value={editData.phone || ''}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Telefone"
                />
                <input
                  type="text"
                  value={editData.restaurantName}
                  onChange={(e) => setEditData({ ...editData, restaurantName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Restaurante"
                />
                <select
                  value={editData.status}
                  onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="prospect">Prospect</option>
                  <option value="invited">Convidado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="active">Ativo</option>
                  <option value="completed">Completado</option>
                  <option value="rejected">Rejeitado</option>
                </select>
                <textarea
                  value={editData.feedbackNotes || ''}
                  onChange={(e) => setEditData({ ...editData, feedbackNotes: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Notas de Feedback"
                  rows={4}
                />
                <Button onClick={handleUpdate} className="w-full bg-green-600 hover:bg-green-700">
                  Salvar Mudanças
                </Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${tester.email}`} className="text-blue-600 hover:underline">{tester.email}</a>
                </div>
                {tester.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <a href={`tel:${tester.phone}`} className="text-blue-600 hover:underline">{tester.phone}</a>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {tester.restaurantCity}, {tester.restaurantState}
                </div>
                <div className="pt-2 border-t">
                  <span className="font-semibold">Status:</span>
                  <div className="mt-1 px-2 py-1 bg-blue-100 text-blue-800 rounded w-fit text-xs font-medium">
                    {tester.status}
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <span className="font-semibold block mb-2">Estatísticas</span>
                  <div className="space-y-1 text-xs">
                    <div>Reuniões Semanais: <span className="font-bold">{tester.weeklyMeetings}</span></div>
                    {tester.feedbackScore && (
                      <div className="flex items-center gap-1">
                        Score de Feedback: <span className="font-bold flex items-center gap-1">{tester.feedbackScore}/5 <Star className="h-3 w-3 fill-yellow-400" /></span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Interações */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Histórico de Interações
              </h2>
              <Button
                size="sm"
                onClick={() => setShowNewInteraction(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {showNewInteraction && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 space-y-3">
                <select
                  value={interactionData.type}
                  onChange={(e) => setInteractionData({ ...interactionData, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="weekly_meeting">Reunião Semanal</option>
                  <option value="feedback_email">Email de Feedback</option>
                  <option value="feature_request">Feature Request</option>
                  <option value="bug_report">Bug Report</option>
                  <option value="survey">Survey</option>
                </select>
                <input
                  type="text"
                  placeholder="Título"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={interactionData.title}
                  onChange={(e) => setInteractionData({ ...interactionData, title: e.target.value })}
                />
                <textarea
                  placeholder="Notas"
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  value={interactionData.notes}
                  onChange={(e) => setInteractionData({ ...interactionData, notes: e.target.value })}
                />
                <div>
                  <label className="text-sm font-semibold">Rating (1-5)</label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={interactionData.rating}
                    onChange={(e) => setInteractionData({ ...interactionData, rating: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${i <= interactionData.rating ? 'fill-yellow-400' : ''} text-yellow-400`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAddInteraction} className="flex-1 bg-green-600 hover:bg-green-700">
                    Registrar
                  </Button>
                  <Button onClick={() => setShowNewInteraction(false)} variant="outline" className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {tester.interactions.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma interação registrada</p>
              ) : (
                tester.interactions.map(interaction => (
                  <div key={interaction.id} className="border-l-4 border-blue-400 pl-3 py-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-sm">{interaction.title}</p>
                        <p className="text-gray-700 text-sm mt-1">{interaction.notes}</p>
                        {interaction.rating && (
                          <div className="flex gap-1 mt-2">
                            {[1, 2, 3, 4, 5].map(i => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i <= interaction.rating ? 'fill-yellow-400' : ''} text-yellow-400`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs bg-gray-100 px-2 py-1 rounded">{interaction.type}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {new Date(interaction.createdAt).toLocaleDateString('pt-BR')}
                    </p>
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
