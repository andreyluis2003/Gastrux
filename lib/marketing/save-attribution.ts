import { prisma } from '@/lib/prisma';
import { parseAttributionCookie } from './attribution';

/** Records the link a new account came from. Never gets in the way of the sign-up. */
export async function saveSignupAttribution(restaurantId: string, rawCookie: string | undefined | null): Promise<void> {
  const attribution = parseAttributionCookie(rawCookie);
  if (!attribution) return;
  try {
    await prisma.signupAttribution.create({ data: { restaurantId, ...attribution } });
  } catch (err) {
    console.error('[signup-attribution] not saved:', err);
  }
}
