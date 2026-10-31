import { getPlatformAdminEmails } from '@/lib/admin/guard';
import { prisma } from '@/lib/prisma';

/** The platform team: role ADMIN or listed in PLATFORM_ADMIN_EMAILS */
export async function platformTeam() {
  const emails = getPlatformAdminEmails();
  return prisma.user.findMany({
    where: { OR: [{ role: 'ADMIN' }, ...(emails.length ? [{ email: { in: emails } }] : [])] },
    select: { id: true, email: true, currentRestaurantId: true },
    take: 20,
  });
}
