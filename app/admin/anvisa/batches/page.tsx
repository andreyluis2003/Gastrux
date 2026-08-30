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
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Trash2,
} from 'lucide-react';
import { formatDate, formatQuantity } from '@/lib/formatters';

interface Batch {
  id: string;
  batchNumber: string;
  expirationDate: string;
  initialQuantity: number;
  currentQuantity: number;
  unit: string;
  active: boolean;
  ingredient: { id: string; name: string };
}

export default function BatchesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [formData, setFormData] = useState({
    ingredientId: '',
    batchNumber: '',
    manufacturer: '',
    manufacturingDate: '',
    expirationDate: '',
    initialQuantity: '',
    unit: 'kg',
  });

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/anvisa/batches');
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setBatches(data.batches || []);
    } catch (error) {
      console.error('Error fetching batches:', error);
      toast.error('Erro ao carregar lotes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.ingredientId || !formData.batchNumber || !formData.expirationDate || !formData.initialQuantity) {
      toast.error('Preencha todos os campos obrigatorios');
      return;
    }

    try {
      const response = await fetch('/api/anvisa/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          initialQuantity: parseFloat(formData.initialQuantity),
        }),
      });

      if (!response.ok) throw new Error('Failed to create');

      toast.success('Lote criado com sucesso');
      setFormData({
        ingredientId: '',
        batchNumber: '',
        manufacturer: '',
        manufacturingDate: '',
        expirationDate: '',
        initialQuantity: '',
        unit: 'kg',
      });
      setShowNewDialog(false);
      fetchBatches();
    } catch (error) {
      console.error('Error creating batch:', error);
      toast.error('Erro ao criar lote');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja deletar este lote?')) return;

    try {
      const response = await fetch(`/api/anvisa/batches/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Lote deletado com sucesso');
      fetchBatches();
    } catch (error) {
      console.error('Error deleting batch:', error);
      toast.error('Erro ao deletar lote');
    }
  };

  const isExpired = (expirationDate: string) => {
    return new Date(expirationDate) < new Date();
  };

  const isExpiringSoon = (expirationDate: string) => {
    const now = new Date();
    const expiry = new Date(expirationDate);
    const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Lotes de Insumos</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Controle de lotes, validades e quantidades
          </p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="gap-2 w-full sm:w-auto"
        >
          <Plus size={18} />
          Novo Lote
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <LoadingSkeleton key={i} />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhum lote registrado</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const expired = isExpired(batch.expirationDate);
            const expiringSoon = isExpiringSoon(batch.expirationDate);

            return (
              <Card
                key={batch.id}
                className={`p-4 transition-colors ${
                  expired
                    ? 'border-red-200 bg-red-50'
                    : expiringSoon
                    ? 'border-yellow-200 bg-yellow-50'
                    : 'border-green-200 bg-green-50'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{batch.ingredient.name}</span>
                      <span className="text-xs bg-background px-2 py-1 rounded">
                        Lote: {batch.batchNumber}
                      </span>
                      {expired && (
                        <AlertTriangle className="text-red-600" size={16} />
                      )}
                      {!expired && !expiringSoon && (
                        <CheckCircle2 className="text-green-600" size={16} />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Validade: {formatDate(new Date(batch.expirationDate))}
                    </p>
                    <p className="text-sm">
                      {formatQuantity(batch.currentQuantity, batch.unit)} /
                      {formatQuantity(batch.initialQuantity, batch.unit)}
                    </p>
                  </div>

                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(batch.id)}
                      className="flex-1 sm:flex-none text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
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