'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Button,
  Card,
  Input,
  Label,
  BackButton,
  LoadingSkeleton,
} from '@/components/ui';
import { toast } from 'sonner';
import {
  Plus,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatDate, formatQuantity } from '@/lib/formatters';

interface Trace {
  id: string;
  batchId: string;
  movementType: string;
  quantity: number;
  unit: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  batch: { id: string; batchNumber: string; ingredient: { name: string } };
}

const MOVEMENT_TYPES: Record<string, any> = {
  received: { label: 'Recebido', icon: 'TrendingUp', color: 'text-green-600' },
  used: { label: 'Utilizado', icon: 'TrendingDown', color: 'text-blue-600' },
  transferred: { label: 'Transferido', icon: 'RefreshCw', color: 'text-yellow-600' },
  discarded: { label: 'Descartado', icon: 'Trash2', color: 'text-red-600' },
};

export default function TracesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  useEffect(() => {
    fetchTraces();
  }, [filterType]);

  const fetchTraces = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('movementType', filterType);

      const response = await fetch(`/api/anvisa/traces?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setTraces(data.traces || []);
    } catch (error) {
      console.error('Error fetching traces:', error);
      toast.error('Erro ao carregar rastreabilidade');
    } finally {
      setLoading(false);
    }
  };

  const filteredTraces = filterType === 'all'
    ? traces
    : traces.filter((t) => t.movementType === filterType);

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Rastreabilidade de Insumos</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Histórico de movimentos e utilização de insumos
          </p>
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="type">Tipo de Movimento</Label>
          <select
            id="type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="all">Todos</option>
            <option value="received">Recebido</option>
            <option value="used">Utilizado</option>
            <option value="transferred">Transferido</option>
            <option value="discarded">Descartado</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : filteredTraces.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhum movimento registrado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTraces.map((trace) => {
            const config = MOVEMENT_TYPES[trace.movementType];
            return (
              <Card key={trace.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{trace.batch.ingredient.name}</span>
                      <span className={`text-sm font-semibold ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        Lote: {trace.batch.batchNumber}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(new Date(trace.createdAt))}
                    </p>
                    <p className="text-sm font-semibold">
                      {formatQuantity(trace.quantity, trace.unit)}
                    </p>
                    {trace.reason && (
                      <p className="text-sm text-muted-foreground">
                        Motivo: {trace.reason}
                      </p>
                    )}
                    {trace.notes && (
                      <p className="text-sm text-muted-foreground">
                        Obs: {trace.notes}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
