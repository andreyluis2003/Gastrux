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
  Search,
  Calendar,
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
} from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/formatters';

interface Reservation {
  id: string;
  guestName: string;
  guestEmail: string;
  partySize: number;
  reservedAt: string;
  status: string;
  table?: { number: number; section: { name: string } };
  guest?: { totalReservations: number; noShowCount: number };
}

interface ReservationsPageProps {}

export default function ReservationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('CONFIRMED');
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showNewDialog, setShowNewDialog] = useState(false);

  if (status === 'loading') return <LoadingSkeleton count={5} />;
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  useEffect(() => {
    fetchReservations();
  }, [statusFilter, page]);

  const fetchReservations = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/reservations?status=${statusFilter}&page=${page}&limit=15`
      );
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setReservations(data.reservations);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      toast.error('Erro ao carregar reservas');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async (id: string) => {
    if (!confirm('Deseja cancelar esta reserva?')) return;

    try {
      const response = await fetch(`/api/admin/reservations/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to cancel');

      toast.success('Reserva cancelada');
      fetchReservations();
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      toast.error('Erro ao cancelar reserva');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
      case 'RESTAURANT_CANCELLED':
        return 'bg-red-100 text-red-800';
      case 'NOSHOW':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      CONFIRMED: 'Confirmada',
      PENDING: 'Pendente',
      COMPLETED: 'Concluída',
      CANCELLED: 'Cancelada pelo Hóspede',
      RESTAURANT_CANCELLED: 'Cancelada pelo Restaurante',
      NOSHOW: 'Não Compareceu',
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold sm:text-3xl">Reservas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Gerencie todas as reservas do restaurante
          </p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="w-full gap-2 sm:w-auto"
        >
          <Plus size={18} />
          Nova Reserva
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="text-sm">Buscar por nome ou email</Label>
            <Input
              placeholder="João Silva, joao@email.com"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mt-2"
            />
          </div>

          <div className="flex-1">
            <Label className="text-sm">Status</Label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="mt-2 w-full rounded border border-border bg-background px-3 py-2"
            >
              <option value="CONFIRMED">Confirmadas</option>
              <option value="PENDING">Pendentes</option>
              <option value="COMPLETED">Concluídas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Reservations List */}
      <div className="space-y-3">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <LoadingSkeleton key={i} />
            ))}
          </>
        ) : reservations.length === 0 ? (
          <Card className="p-8 text-center">
            <Calendar size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma reserva encontrada</p>
          </Card>
        ) : (
          reservations.map((reservation) => (
            <Card key={reservation.id} className="overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                {/* Guest Info */}
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold truncate">{reservation.guestName}</h3>
                  <p className="break-words text-sm text-muted-foreground">
                    {reservation.guestEmail}
                  </p>

                  {/* Details */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Users size={16} className="text-muted-foreground" />
                      <span>{reservation.partySize} pessoa(s)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-muted-foreground" />
                      <span>{formatDateTime(new Date(reservation.reservedAt))}</span>
                    </div>
                    {reservation.table && (
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-secondary px-2 py-1 text-xs font-medium">
                          Mesa {reservation.table.number} - {reservation.table.section.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(reservation.status)}`}>
                    {getStatusLabel(reservation.status)}
                  </span>

                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/admin/reservations/${reservation.id}`)}
                    >
                      <Edit2 size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelReservation(reservation.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="outline"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="gap-2"
          >
            <ChevronLeft size={16} />
            Anterior
          </Button>

          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>

          <Button
            variant="outline"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="gap-2"
          >
            Próximo
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
