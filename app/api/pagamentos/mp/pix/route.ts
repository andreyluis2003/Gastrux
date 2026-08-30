// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
});

/**
 * @swagger
 * /api/pagamentos/mp/pix:
 *   post:
 *     tags: [Pagamentos - PIX]
 *     summary: Criar pagamento PIX
 *     description: Gera um QR Code PIX para pagamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, description]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 150.00
 *               description:
 *                 type: string
 *                 example: "Pedido #1234"
 *               payerEmail:
 *                 type: string
 *                 example: "cliente@email.com"
 *               payerName:
 *                 type: string
 *                 example: "João Silva"
 *               externalReference:
 *                 type: string
 *                 example: "order-1234"
 *     responses:
 *       200:
 *         description: QR Code PIX gerado com sucesso
 *       400:
 *         description: Dados inválidos
 *       500:
 *         description: Erro ao gerar PIX
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, description, payerEmail, payerName, externalReference } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }

    const payment = new Payment(mpClient);

    const response = await payment.create({
      body: {
        transaction_amount: Number(amount),
        description: description || 'Pagamento via PIX',
        payment_method_id: 'pix',
        payer: {
          email: payerEmail || 'cliente@exemplo.com',
          first_name: payerName?.split(' ')[0] || 'Cliente',
          last_name: payerName?.split(' ').slice(1).join(' ') || '',
        },
        external_reference: externalReference || `pix-${Date.now()}`,
        notification_url: `${process.env.NEXTAUTH_URL}/api/pagamentos/mp/webhook`,
      },
    });

    const pixData = response.point_of_interaction?.transaction_data;

    return NextResponse.json({
      success: true,
      paymentId: response.id?.toString(),
      status: response.status,
      statusDetail: response.status_detail,
      qrCode: pixData?.qr_code || '',
      qrCodeBase64: pixData?.qr_code_base64 || '',
      ticketUrl: pixData?.ticket_url || '',
      expirationDate: response.date_of_expiration,
      amount: amount,
      description: description,
    });
  } catch (error: any) {
    console.error('[PIX] Erro ao criar pagamento:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar PIX', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/pagamentos/mp/pix:
 *   get:
 *     tags: [Pagamentos - PIX]
 *     summary: Consultar status do PIX
 *     description: Verifica o status atual de um pagamento PIX
 *     parameters:
 *       - in: query
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status do pagamento retornado
 *       400:
 *         description: ID do pagamento não informado
 *       500:
 *         description: Erro ao consultar status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: 'ID do pagamento não informado' }, { status: 400 });
    }

    const payment = new Payment(mpClient);
    const response = await payment.get({ id: paymentId });

    return NextResponse.json({
      success: true,
      paymentId: response.id?.toString(),
      status: response.status,
      statusDetail: response.status_detail,
      transactionAmount: response.transaction_amount,
      dateCreated: response.date_created,
      dateApproved: response.date_approved,
      payerEmail: response.payer?.email,
      externalReference: response.external_reference,
    });
  } catch (error: any) {
    console.error('[PIX] Erro ao consultar status:', error);
    return NextResponse.json(
      { error: 'Erro ao consultar status', details: error.message },
      { status: 500 }
    );
  }
}
