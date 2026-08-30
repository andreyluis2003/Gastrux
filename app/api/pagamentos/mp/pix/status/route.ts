// @ts-nocheck
// Feature #3: Verificar status de pagamento PIX
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export const dynamic = 'force-dynamic';

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
});

/**
 * GET /api/pagamentos/mp/pix/status?paymentId=xxx
 * Verifica o status atual de um pagamento PIX no Mercado Pago.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId obrigatório' }, { status: 400 });
    }

    const payment = new Payment(mpClient);
    const response = await payment.get({ id: paymentId });

    return NextResponse.json({
      status: response.status,
      statusDetail: response.status_detail,
      approved: response.status === 'approved',
      paymentId: response.id?.toString(),
      amount: response.transaction_amount,
      dateApproved: response.date_approved,
      payer: response.payer ? {
        email: response.payer.email,
        firstName: response.payer.first_name,
      } : null,
    });
  } catch (error: any) {
    console.error('[PIX Status] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao verificar status do pagamento', details: error?.message },
      { status: 500 }
    );
  }
}
