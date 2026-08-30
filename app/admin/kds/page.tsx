// Kitchen Display System (KDS) Admin Page
'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/ui/back-button';
import { KDSDisplay } from '@/components/kds/kds-display';
import { toast } from 'sonner';
import { Plus, Settings, Trash2 } from 'lucide-react';

export default function KDSPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationColor, setNewStationColor] = useState('#3b82f6');

  // Check authentication
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Load stations
  useEffect(() => {
    const loadStations = async () => {
      try {
        const res = await fetch('/api/kds/stations');
        if (res.ok) {
          const data = await res.json();
          setStations(data);
        }
      } catch (error) {
        console.error('Failed to load stations:', error);
        toast.error('Falha ao carregar estações');
      } finally {
        setLoading(false);
      }
    };

    loadStations();
  }, []);

  const handleAddStation = async () => {
    if (!newStationName.trim()) {
      toast.error('Nome da estação é obrigatório');
      return;
    }

    try {
      const res = await fetch('/api/kds/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStationName,
          displayColor: newStationColor,
        }),
      });

      if (res.ok) {
        const newStation = await res.json();
        setStations([...stations, newStation]);
        setNewStationName('');
        setNewStationColor('#3b82f6');
        setShowAddStation(false);
        toast.success('Estação criada com sucesso');
      } else {
        toast.error('Falha ao criar estação');
      }
    } catch (error) {
      console.error('Error adding station:', error);
      toast.error('Erro ao adicionar estação');
    }
  };

  const handleDeleteStation = async (stationId: string) => {
    if (!confirm('Deseja realmente deletar esta estação?')) {
      return;
    }

    try {
      const res = await fetch(`/api/kds/stations/${stationId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setStations(stations.filter((s) => s.id !== stationId));
        toast.success('Estação deletada com sucesso');
      } else {
        toast.error('Falha ao deletar estação');
      }
    } catch (error) {
      console.error('Error deleting station:', error);
      toast.error('Erro ao deletar estação');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-8">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl sm:text-3xl font-bold">Kitchen Display System</h1>
        </div>
      </div>

      {/* Stations Management */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Estações de Cozinha</h2>
          <Button
            onClick={() => setShowAddStation(!showAddStation)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" /> Nova Estação
          </Button>
        </div>

        {showAddStation && (
          <div className="mb-6 p-4 border rounded-lg space-y-4 bg-gray-50">
            <div>
              <Label htmlFor="station-name">Nome da Estação</Label>
              <Input
                id="station-name"
                placeholder="Ex: Grill, Fritadeira, Molhos"
                value={newStationName}
                onChange={(e) => setNewStationName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="station-color">Cor de Exibição</Label>
              <div className="flex gap-2">
                <input
                  id="station-color"
                  type="color"
                  value={newStationColor}
                  onChange={(e) => setNewStationColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-600 flex items-center">
                  {newStationColor}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddStation} className="flex-1 bg-blue-500 hover:bg-blue-600">
                Adicionar
              </Button>
              <Button
                onClick={() => setShowAddStation(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {stations.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Nenhuma estação configurada</p>
          ) : (
            stations.map((station) => (
              <div
                key={station.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: station.displayColor }}
                  />
                  <div>
                    <p className="font-semibold">{station.name}</p>
                    {station.description && (
                      <p className="text-sm text-gray-600">{station.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteStation(station.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Main KDS Display */}
      <Card className="p-6">
        <KDSDisplay />
      </Card>
    </div>
  );
}
