// @ts-nocheck
// Feature: Programa de Indicação - referral cashback
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateLoyaltyProgram, getRestaurantIdForCustomer } from '@/lib/loyalty/get-program';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

const REFERRAL_BONUS_POINTS = 20; // Pontos para quem indica
const REFERRED_BONUS_POINTS = 10; // Pontos para quem foi indicado

// GET: Get referral stats for a customer
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({
        referralBonus: REFERRAL_BONUS_POINTS,
        referredBonus: REFERRED_BONUS_POINTS,
        totalReferrals: 0,
        successfulConversions: 0,
        totalCashbackGiven: 0,
        conversionRate: 0,
        recentReferrals: [],
      });
    }

    // Todas as transações de indicação (quem indicou) — escopadas pela loja
    const referralTx = await prisma.loyaltyTransaction.findMany({
      where: { reason: { startsWith: 'Indicação:' }, type: 'EARNING', customer: { restaurantId } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Transações de clientes que foram indicados (conversões) — escopadas pela loja
    const referredTx = await prisma.loyaltyTransaction.findMany({
      where: { reason: { startsWith: 'Indicado por:' }, type: 'EARNING', customer: { restaurantId } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const totalReferrals = referralTx.length;
    const successfulConversions = referredTx.length;
    const totalCashbackGiven =
      referralTx.reduce((s, t) => s + Number(t.amount || 0), 0) +
      referredTx.reduce((s, t) => s + Number(t.amount || 0), 0);
    const conversionRate = totalReferrals > 0 ? (successfulConversions / totalReferrals) * 100 : 0;

    const recentReferrals = referralTx.slice(0, 15).map((t) => ({
      referrerName: t.customer?.name || 'Cliente',
      referredName: 'Novo cliente',
      status: 'CONVERTED',
      cashback: Number(t.amount || 0),
      date: t.createdAt,
    }));

    return NextResponse.json({
      referralBonus: REFERRAL_BONUS_POINTS,
      referredBonus: REFERRED_BONUS_POINTS,
      totalReferrals,
      successfulConversions,
      totalCashbackGiven,
      conversionRate,
      recentReferrals,
    });
  } catch (error) {
    console.error('Error fetching referral data:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

// POST: Process a referral { referrerCustomerId, referredCustomerId }
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { referrerCustomerId, referredCustomerId } = await req.json();
    if (!referrerCustomerId || !referredCustomerId) {
      return NextResponse.json({ error: 'IDs obrigat\u00f3rios' }, { status: 400 });
    }
    if (referrerCustomerId === referredCustomerId) {
      return NextResponse.json({ error: 'N\u00e3o pode indicar a si mesmo' }, { status: 400 });
    }

    // Check if already referred
    const existing = await prisma.loyaltyTransaction.findFirst({
      where: { customerId: referredCustomerId, reason: { startsWith: 'Indicado por:' } },
    });
    if (existing) return NextResponse.json({ error: 'Cliente j\u00e1 foi indicado' }, { status: 409 });

    // Find or create program escopado pela loja do cliente indicador (isolamento multi-tenant)
    const restaurantId = await getRestaurantIdForCustomer(referrerCustomerId);
    const program = await getOrCreateLoyaltyProgram(restaurantId);

    // Credit referrer
    let referrerAccount = await prisma.customerLoyaltyAccount.findFirst({ where: { customerId: referrerCustomerId, programId: program.id } });
    if (!referrerAccount) {
      referrerAccount = await prisma.customerLoyaltyAccount.create({ data: { customerId: referrerCustomerId, programId: program.id } });
    }
    await prisma.loyaltyTransaction.create({
      data: {
        customerId: referrerCustomerId, accountId: referrerAccount.id, programId: program.id,
        type: 'EARNING', amount: REFERRAL_BONUS_POINTS,
        reason: `Indica\u00e7\u00e3o: novo cliente`,
        balanceBefore: referrerAccount.currentPoints, balanceAfter: referrerAccount.currentPoints + REFERRAL_BONUS_POINTS,
      },
    });
    await prisma.customerLoyaltyAccount.update({
      where: { id: referrerAccount.id },
      data: { currentPoints: { increment: REFERRAL_BONUS_POINTS }, totalPointsEarned: { increment: REFERRAL_BONUS_POINTS }, lastActivityAt: new Date() },
    });

    // Credit referred
    let referredAccount = await prisma.customerLoyaltyAccount.findFirst({ where: { customerId: referredCustomerId, programId: program.id } });
    if (!referredAccount) {
      referredAccount = await prisma.customerLoyaltyAccount.create({ data: { customerId: referredCustomerId, programId: program.id } });
    }
    await prisma.loyaltyTransaction.create({
      data: {
        customerId: referredCustomerId, accountId: referredAccount.id, programId: program.id,
        type: 'EARNING', amount: REFERRED_BONUS_POINTS,
        reason: `Indicado por: cliente fidelidade`,
        balanceBefore: referredAccount.currentPoints, balanceAfter: referredAccount.currentPoints + REFERRED_BONUS_POINTS,
      },
    });
    await prisma.customerLoyaltyAccount.update({
      where: { id: referredAccount.id },
      data: { currentPoints: { increment: REFERRED_BONUS_POINTS }, totalPointsEarned: { increment: REFERRED_BONUS_POINTS }, lastActivityAt: new Date() },
    });

    return NextResponse.json({ success: true, referrerBonus: REFERRAL_BONUS_POINTS, referredBonus: REFERRED_BONUS_POINTS });
  } catch (error) {
    console.error('Error processing referral:', error);
    return NextResponse.json({ error: 'Erro ao processar indica\u00e7\u00e3o' }, { status: 500 });
  }
}
