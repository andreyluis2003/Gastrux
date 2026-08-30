// @ts-nocheck
import { prisma } from '@/lib/prisma';
import type { ReservationDraft } from './types';

export interface ReservationValidation {
  ok: boolean;
  error?: string;
  reservedAt?: Date;
}

/**
 * Valida se os dados básicos do draft são suficientes.
 */
export function validateDraft(draft: ReservationDraft, cfg: {
  maxPartySize: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
}): ReservationValidation {
  if (!draft.partySize) return { ok: false, error: 'Quantidade de pessoas não informada' };
  if (draft.partySize < 1 || draft.partySize > cfg.maxPartySize) {
    return { ok: false, error: `Grupo deve ter entre 1 e ${cfg.maxPartySize} pessoas` };
  }
  if (!draft.date) return { ok: false, error: 'Data não informada' };
  if (!draft.time) return { ok: false, error: 'Horário não informado' };
  if (!draft.name) return { ok: false, error: 'Nome não informado' };

  // Monta DateTime
  const isoString = `${draft.date}T${draft.time}:00`;
  const dt = new Date(isoString);
  if (isNaN(dt.getTime())) return { ok: false, error: 'Data ou horário inválidos' };

  const now = new Date();
  const minutesAhead = (dt.getTime() - now.getTime()) / 60000;
  if (minutesAhead < cfg.minAdvanceMinutes) {
    return { ok: false, error: 'Reserva precisa ser com ao menos ' + cfg.minAdvanceMinutes + 'min de antecedência' };
  }
  const daysAhead = minutesAhead / 60 / 24;
  if (daysAhead > cfg.maxAdvanceDays) {
    return { ok: false, error: `Só aceitamos reservas até ${cfg.maxAdvanceDays} dias à frente` };
  }
  return { ok: true, reservedAt: dt };
}

/**
 * Cria Reservation no banco a partir do draft validado.
 */
export async function createReservationFromDraft(
  restaurantId: string,
  draft: ReservationDraft,
  reservedAt: Date,
  callPhone?: string,
) {
  const phone = draft.phone || callPhone || null;

  // Procura ou cria guest
  let guest = null as any;
  if (phone) {
    guest = await prisma.guestProfile.findFirst({
      where: { restaurantId, phone },
    });
  }
  if (!guest) {
    guest = await prisma.guestProfile.create({
      data: {
        restaurantId,
        name: draft.name || 'Cliente',
        email: `${(phone || 'phone-' + Date.now()).replace(/[^0-9]/g, '')}@voz.local`,
        phone: phone || null,
        totalReservations: 1,
        firstReservationAt: new Date(),
        lastReservationAt: new Date(),
      },
    });
  } else {
    await prisma.guestProfile.update({
      where: { id: guest.id },
      data: {
        totalReservations: { increment: 1 },
        lastReservationAt: new Date(),
        name: draft.name || guest.name,
      },
    });
  }

  const reservation = await prisma.reservation.create({
    data: {
      restaurantId,
      guestId: guest?.id || null,
      guestName: draft.name || 'Cliente',
      guestEmail: guest?.email || `phone-${Date.now()}@voz.local`,
      guestPhone: phone,
      partySize: draft.partySize!,
      reservedAt,
      duration: 90,
      status: 'CONFIRMED',
      notes: [
        'Criada via agente de voz (IA).',
        draft.notes ? `Obs: ${draft.notes}` : '',
      ].filter(Boolean).join(' '),
    },
  });

  return reservation;
}
