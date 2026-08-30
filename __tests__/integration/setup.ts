/**
 * Integration Test Setup
 * Configures the test environment before running integration tests
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: '.env' });

const prisma = new PrismaClient();

/**
 * Global setup for integration tests
 */
export async function setup() {
  console.log('\n=== Integration Test Setup ===');

  // Verify database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connection verified');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }

  // Clean any leftover test data
  await cleanupTestData();

  console.log('✅ Integration test setup complete\n');
}

/**
 * Global teardown for integration tests
 */
export async function teardown() {
  console.log('\n=== Integration Test Teardown ===');

  // Clean up test data
  await cleanupTestData();

  // Disconnect from database
  await prisma.$disconnect();

  console.log('✅ Integration test teardown complete\n');
}

/**
 * Clean up all test data
 */
async function cleanupTestData() {
  const testEmails = [
    'owner-int@test.com',
    'manager-int@test.com',
    'cook-int@test.com',
    'cashier-int@test.com',
    'owner-stock-a@test.com',
    'owner-stock-b@test.com',
    'owner-orders-a@test.com',
    'owner-orders-b@test.com',
    'owner-fin-a@test.com',
    'owner-fin-b@test.com',
    'owner-trx@test.com',
    'owner-perf@test.com',
    'owner-iso-a@test.com',
    'owner-iso-b@test.com',
    'owner-workflow-a@test.com',
    'owner-workflow-b@test.com',
    'owner-delivery@test.com',
    'multi-restaurant@test.com',
    'different-roles@test.com',
    'manager-iso-a@test.com',
    'cook-restricted@test.com',
  ];

  // Find and delete test users (and their associated data will cascade)
  for (const email of testEmails) {
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (error) {
      // User might not exist or have constraints
    }
  }

  // Clean up test restaurants
  const testRestaurantNames = [
    'Restaurant A - Integration Test',
    'Restaurant B - Integration Test',
    'Delivery Restaurant B',
    'Pizzaria Bella Integration',
    'Burger House Integration',
  ];

  for (const name of testRestaurantNames) {
    try {
      const restaurant = await prisma.restaurant.findFirst({ where: { name } });
      if (restaurant) {
        await prisma.restaurant.delete({ where: { id: restaurant.id } });
      }
    } catch (error) {
      // Restaurant might not exist
    }
  }
}

/**
 * Setup before each test
 */
export async function beforeEachTest() {
  // Can be used to reset state between tests
}

/**
 * Teardown after each test
 */
export async function afterEachTest() {
  // Can be used to clean up after each test
}
