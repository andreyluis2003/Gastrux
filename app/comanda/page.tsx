'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, ChefHat, Users } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';

interface Table {
  id: string;
  number: number;
  section: { id: string; name: string };
  orderSessions: any[];
}

export default function ComandaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [newSessionLoading, setNewSessionLoading] = useState(false);

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/comanda/tables');
      if (res.ok) {
        const data: Table[] = await res.json();
        setTables(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar mesas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedTable && !customerName.trim()) {
      toast.error('Selecione uma mesa ou insira o nome do cliente');
      return;
    }

    try {
      setNewSessionLoading(true);
      const res = await fetch('/api/comanda/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: selectedTable?.id || null,
          customerName: customerName || null,
        }),
      });

      if (res.ok) {
        const session = await res.json();
        toast.success(`Comanda aberta!`);
        router.push(`/comanda/${session.id}`);
      } else {
        toast.error('Erro ao criar comanda');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao criar comanda');
    } finally {
      setNewSessionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <BackButton />
          <ChefHat className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">Comanda Eletrônica</h1>
        </div>

        <div className="flex gap-3 mb-8">
          <Button
            onClick={() => setShowNewSession(!showNewSession)}
            size="lg"
            className="flex gap-2 w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            Nova Comanda
          </Button>
        </div>

        {showNewSession && (
          <Card className="p-6 mb-8 bg-white shadow-lg">
            <h2 className="text-xl font-bold mb-6">Abrir Nova Comanda</h2>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  Selecione a Mesa
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {tables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => {
                        setSelectedTable(table);
                        setCustomerName('');
                      }}
                      className={`p-4 rounded-lg border-2 font-semibold transition-all ${
                        selectedTable?.id === table.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-50 text-gray-800 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-bold">{table.number}</div>
                        <div className="text-xs">{table.section.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Ou insira o nome do cliente
                </label>
                <Input
                  placeholder="Nome do cliente"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (e.target.value) setSelectedTable(null);
                  }}
                  className="mb-4"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleCreateSession}
                  disabled={newSessionLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {newSessionLoading ? 'Criando...' : 'Abrir Comanda'}
                </Button>
                <Button
                  onClick={() => {
                    setShowNewSession(false);
                    setSelectedTable(null);
                    setCustomerName('');
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!showNewSession && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Clique em "Nova Comanda" para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}
