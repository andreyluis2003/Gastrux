// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate or return existing referral code
    if (user.referralCode) {
      return NextResponse.json({
        referralCode: user.referralCode,
        referralUrl: `${process.env.NEXTAUTH_URL || 'https://restaurantes.abacusai.app'}/?ref=${user.referralCode}`,
      });
    }

    // Generate new referral code: referral_[userId]_[random]
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const referralCode = `referral_${user.id.substring(0, 6)}_${randomStr}`;

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { referralCode },
    });

    return NextResponse.json({
      referralCode: updatedUser.referralCode,
      referralUrl: `${process.env.NEXTAUTH_URL || 'https://restaurantes.abacusai.app'}/?ref=${updatedUser.referralCode}`,
    });
  } catch (error) {
    console.error('Error generating referral code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
