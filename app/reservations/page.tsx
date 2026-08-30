'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Input, Label } from '@/components/ui';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Clock, Users, MapPin } from 'lucide-react';

interface AvailableTable {
  id: string;
  number: number;
  capacity: number;
  section: { name: string };
}

export default function ReservationsPage() {
  const [step, setStep] = useState<'date' | 'details' | 'confirmation'>('date');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [partySize, setPartySize] = useState<string>('2');
  const [guestName, setGuestName] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<AvailableTable | null>(null);
  const [availableTables, setAvailableTables] = useState<AvailableTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const times = ['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30'];

  useEffect(() => {
    if (selectedDate && selectedTime && partySize) {
      fetchAvailableTables();
    }
  }, [selectedDate, selectedTime, partySize]);

  const fetchAvailableTables = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/reservations?date=${selectedDate}&time=${selectedTime}&partySize=${partySize}`
      );

      if (!response.ok) throw new Error('Failed to fetch tables');

      const data = await response.json();
      setAvailableTables(data.availableTables);
    } catch (error) {
      console.error('Error fetching tables:', error);
      toast.error('Erro ao carregar mesas disponíveis');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReservation = async () => {
    if (!guestName || !guestEmail) {
      toast.error('Preencha nome e email');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName,
          guestEmail,
          guestPhone,
          partySize: parseInt(partySize),
          tableId: selectedTable?.id,
          reservedAt: `${selectedDate}T${selectedTime}`,
          notes,
        }),
      });

      if (!response.ok) throw new Error('Failed to create reservation');

      toast.success('Reserva criada com sucesso! Confira seu email.');
      setStep('confirmation');
    } catch (error) {
      console.error('Error creating reservation:', error);
      toast.error('Erro ao criar reserva');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const days = [];
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
  }

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const isDateDisabled = (date: Date | null) => {
    if (!date) return true;
    return date < new Date() || date.getHours() < new Date().getHours();
  };

  if (step === 'confirmation') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md space-y-6 p-8 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Reserva Confirmada!</h1>
            <p className="text-muted-foreground">
              Um email de confirmação foi enviado para {guestEmail}
            </p>
          </div>

          <div className="space-y-3 text-left rounded-lg bg-secondary/10 p-4">
            <p>
              <strong>Nome:</strong> {guestName}
            </p>
            <p>
              <strong>Data:</strong>{' '}
              {new Date(selectedDate).toLocaleDateString('pt-BR')}
            </p>
            <p>
              <strong>Hora:</strong> {selectedTime}
            </p>
            <p>
              <strong>Pessoas:</strong> {partySize}
            </p>
            {selectedTable && (
              <p>
                <strong>Mesa:</strong> {selectedTable.number} -{' '}
                {selectedTable.section.name}
              </p>
            )}
          </div>

          <Button onClick={() => window.location.href = '/'} className="w-full">
            Voltar ao Início
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-2xl space-y-6 p-6 sm:p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Reserve sua Mesa</h1>
          <p className="text-muted-foreground">
            Escolha a data, hora e informações do seu grupo
          </p>
        </div>

        {step === 'date' && (
          <div className="space-y-6">
            {/* Party Size */}
            <div>
              <Label className="flex items-center gap-2">
                <Users size={16} />
                Número de Pessoas
              </Label>
              <select
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-background px-3 py-2"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((size) => (
                  <option key={size} value={size}>
                    {size} pessoa{size > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Calendar */}
            <div>
              <Label>Selecione a Data</Label>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                      )
                    }
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <h3 className="font-semibold">
                    {currentMonth.toLocaleString('pt-BR', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentMonth(
                        new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                      )
                    }
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(
                    (day) => (
                      <div
                        key={day}
                        className="p-2 text-center text-sm font-medium text-muted-foreground"
                      >
                        {day}
                      </div>
                    )
                  )}
                  {days.map((date, index) => (
                    <button
                      key={index}
                      onClick={() =>
                        date && setSelectedDate(formatDate(date))
                      }
                      disabled={isDateDisabled(date)}
                      className={`rounded p-2 text-sm ${
                        date
                          ? selectedDate === formatDate(date)
                            ? 'bg-primary text-primary-foreground'
                            : isDateDisabled(date)
                            ? 'cursor-not-allowed text-muted-foreground opacity-50'
                            : 'hover:bg-secondary'
                          : ''
                      }`}
                    >
                      {date?.getDate()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Time Selection */}
            {selectedDate && (
              <div>
                <Label className="flex items-center gap-2">
                  <Clock size={16} />
                  Selecione o Horário
                </Label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {times.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`rounded border px-3 py-2 text-sm font-medium transition ${
                        selectedTime === time
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedDate && selectedTime && (
              <Button
                onClick={() => setStep('details')}
                disabled={availableTables.length === 0}
                className="w-full"
              >
                {availableTables.length === 0
                  ? 'Nenhuma mesa disponível'
                  : `Continuar (${availableTables.length} mesa${availableTables.length > 1 ? 's' : ''} disponível${availableTables.length > 1 ? 's' : ''})`}
              </Button>
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-6">
            {/* Tables Selection */}
            <div>
              <Label className="flex items-center gap-2">
                <MapPin size={16} />
                Escolha sua Mesa (Opcional)
              </Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {availableTables.map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    className={`rounded border p-3 text-left transition ${
                      selectedTable?.id === table.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    <p className="font-medium">Mesa {table.number}</p>
                    <p className="text-sm text-muted-foreground">
                      {table.section.name} • {table.capacity} lugares
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Guest Info */}
            <div className="space-y-4">
              <h3 className="font-semibold">Informações do Hóspede</h3>

              <div>
                <Label>Nome *</Label>
                <Input
                  placeholder="Seu nome completo"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Telefone</Label>
                <Input
                  placeholder="(11) 99999-9999"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Observações</Label>
                <textarea
                  placeholder="Alergias, preferências, ocasião especial..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 w-full rounded border border-border bg-background px-3 py-2"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStep('date')}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                onClick={handleCreateReservation}
                disabled={loading || !guestName || !guestEmail}
                className="flex-1"
              >
                {loading ? 'Criando...' : 'Confirmar Reserva'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
