import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

/** The date on app/termos/page.tsx: change both together when the Terms change */
export const TERMS_VERSION = '2026-10-18';

/**
 * Proof that the owner accepted the Terms for this plan (owner decision 2026-11-01: no separate contract).
 * No foreign keys on purpose: the proof has to outlive a deleted account.
 */
export async function recordSubscriptionAcceptance(
  request: NextRequest,
  input: { userId: string; restaurantId: string; tier: string; billingCycle: string; amount: number; gateway: string },
) {
  await prisma.subscriptionAcceptance.create({
    data: {
      ...input,
      termsVersion: TERMS_VERSION,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) || null,
      userAgent: request.headers.get('user-agent')?.slice(0, 300) || null,
    },
  });
}
