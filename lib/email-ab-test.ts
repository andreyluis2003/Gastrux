// @ts-nocheck
import { prisma } from './prisma';

/**
 * Get a random email variant for A/B testing
 * Respects weight distribution (e.g., 50% A, 50% B)
 */
export async function getEmailVariant(emailType: string) {
  try {
    const variants = await prisma.emailVariant.findMany({
      where: {
        emailType: emailType as any,
      },
    });

    if (variants.length === 0) {
      return null;
    }

    if (variants.length === 1) {
      return variants[0];
    }

    // Calculate weighted random selection
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of variants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant;
      }
    }

    return variants[0];
  } catch (error) {
    console.error('Error getting email variant:', error);
    return null;
  }
}

/**
 * Assign and get variant for a user
 */
export async function assignUserVariant(userId: string, emailType: string) {
  try {
    const variant = await getEmailVariant(emailType);
    if (!variant) return null;

    // Update user with assigned variant
    if (emailType === 'day3') {
      await prisma.user.update({
        where: { id: userId },
        data: { emailVariantDay3: variant.variantLabel },
      });
    } else if (emailType === 'day7') {
      await prisma.user.update({
        where: { id: userId },
        data: { emailVariantDay7: variant.variantLabel },
      });
    }

    return variant;
  } catch (error) {
    console.error('Error assigning variant:', error);
    return null;
  }
}

/**
 * Get A/B test results for comparison
 */
export async function getABTestResults(emailType: string) {
  try {
    const variants = await prisma.emailVariant.findMany({
      where: {
        emailType: emailType as any,
      },
    });

    const results = await Promise.all(
      variants.map(async (variant) => {
        const logs = await prisma.emailDeliveryLog.findMany({
          where: {
            emailType: emailType as any,
            variant: variant.variantLabel,
          },
        });

        const sent = logs.length;
        const opened = logs.filter((l) => l.openedAt).length;
        const clicked = logs.filter((l) => l.clickedAt).length;

        return {
          variantLabel: variant.variantLabel,
          variant: variant,
          sent,
          opened,
          clicked,
          openRate: sent > 0 ? (opened / sent) * 100 : 0,
          clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
        };
      })
    );

    return results;
  } catch (error) {
    console.error('Error getting A/B test results:', error);
    return [];
  }
}

/**
 * Determine winner variant based on open rate
 */
export async function determineWinner(emailType: string) {
  try {
    const results = await getABTestResults(emailType);
    if (results.length < 2) return null;

    // Find variant with highest open rate
    const winner = results.reduce((prev, current) =>
      current.openRate > prev.openRate ? current : prev
    );

    // Mark as winner in database
    await prisma.emailVariant.updateMany({
      where: {
        emailType: emailType as any,
      },
      data: { isWinner: false },
    });

    await prisma.emailVariant.update({
      where: {
        emailType_variantLabel: {
          emailType: emailType as any,
          variantLabel: winner.variantLabel,
        },
      },
      data: { isWinner: true },
    });

    return winner;
  } catch (error) {
    console.error('Error determining winner:', error);
    return null;
  }
}
