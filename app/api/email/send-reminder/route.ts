// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/email/send-reminder - Send reservation reminder email
export async function POST(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization');
    const secretKey = process.env.REMINDER_SECRET_KEY;

    if (!secretKey || authHeader !== `Bearer ${secretKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const {
      email,
      guestName,
      reservationTime,
      tableNumber,
      tableSectionName,
      partySize,
      reminderType,
    } = await req.json();

    if (!email || !guestName || !reservationTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const reservedAt = new Date(reservationTime);
    const timeUntilReservation = reminderType === 'REMINDER_24H' ? '24 horas' : '1 hora';

    // Format reservation time for email
    const formattedTime = reservedAt.toLocaleString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const emailBody = `
      <h2>Lembrete de Reserva</h2>
      <p>Olá ${guestName},</p>
      <p>Seu lembrete de reserva em nosso restaurante!</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3>Detalhes da Reserva</h3>
        <p><strong>Data e Hora:</strong> ${formattedTime}</p>
        <p><strong>Número de Pessoas:</strong> ${partySize}</p>
        ${tableNumber ? `<p><strong>Mesa:</strong> ${tableNumber}${tableSectionName ? ` (${tableSectionName})` : ''}</p>` : ''}
        <p><strong>Lembrete:</strong> ${timeUntilReservation} antes</p>
      </div>

      <p>Confirme sua presença ou entre em contato conosco se precisar fazer alterações.</p>
      
      <p>Obrigado por reservar conosco!</p>
    `;

    // Send email using the internal email notification system
    const emailResponse = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/notifications/send-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          subject: `Lembrete de Reserva - ${timeUntilReservation} antes`,
          htmlContent: emailBody,
          type: 'reservation_reminder',
        }),
      }
    );

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      throw new Error(
        `Failed to send email: ${errorData.error || emailResponse.statusText}`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return NextResponse.json(
      { error: 'Failed to send reminder email' },
      { status: 500 }
    );
  }
}
