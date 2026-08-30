// @ts-nocheck
/**
 * Restaurant Context Helper
 * 
 * Provides utilities for extracting and validating restaurantId from the user session.
 * This ensures consistent multi-tenancy enforcement across all API routes.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface SessionWithRestaurant {
  userId: string;
  restaurantId: string;
  role: string;
}

/**
 * Extracts the current user's restaurantId from session.
 * 
 * @returns SessionWithRestaurant object with userId, restaurantId, and role
 * @throws Error if session not found, user not found, or restaurant not set
 */
export async function getRestaurantContext(): Promise<SessionWithRestaurant> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error('UNAUTHORIZED: Session not found');
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      currentRestaurantId: true,
      role: true,
    },
  });

  if (!user) {
    throw new Error('UNAUTHORIZED: User not found');
  }

  if (!user.currentRestaurantId) {
    throw new Error('NO_RESTAURANT: User has no restaurant selected');
  }

  return {
    userId: user.id,
    restaurantId: user.currentRestaurantId,
    role: user.role || 'MANAGER',
  };
}

/**
 * Validates that a given restaurantId belongs to the current user.
 * 
 * @param restaurantId The restaurant ID to validate
 * @returns true if user has access to this restaurant
 */
export async function validateRestaurantAccess(
  userId: string,
  restaurantId: string
): Promise<boolean> {
  const restaurantUser = await prisma.restaurantUser.findUnique({
    where: {
      userId_restaurantId: {
        userId,
        restaurantId,
      },
    },
  });

  return !!restaurantUser;
}

/**
 * Enforces restaurantId filtering for queries.
 * 
 * Used in API routes to ensure all queries are scoped to the current restaurant.
 * Throws error if restaurantId doesn't match user's context.
 * 
 * @param requestRestaurantId The restaurantId from request/params
 * @param contextRestaurantId The restaurantId from user session
 * @throws Error if IDs don't match
 */
export function enforceRestaurantIsolation(
  requestRestaurantId: string | undefined,
  contextRestaurantId: string
): void {
  if (!requestRestaurantId) {
    throw new Error('FORBIDDEN: restaurantId required in request');
  }

  if (requestRestaurantId !== contextRestaurantId) {
    throw new Error('FORBIDDEN: Access denied to this restaurant');
  }
}
