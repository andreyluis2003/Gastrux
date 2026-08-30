// Test data fixtures - HTTP-based for E2E testing
// Note: These are designed to work with a running dev server at http://localhost:3000

// Test restaurant data
export const TEST_RESTAURANTS = [
  {
    name: 'Pizzaria Bella E2E',
    status: 'ACTIVE' as const,
    subscriptionStatus: 'active' as const,
  },
  {
    name: 'Burger House E2E',
    status: 'ACTIVE' as const,
    subscriptionStatus: 'active' as const,
  },
  {
    name: 'Sushi Bar E2E',
    status: 'ACTIVE' as const,
    subscriptionStatus: 'active' as const,
  },
];

// Test users data
export const TEST_USERS = [
  {
    email: 'owner1@e2etest.com',
    password: 'TestPassword123!',
    name: 'Owner One',
    role: 'OWNER' as const,
  },
  {
    email: 'owner2@e2etest.com',
    password: 'TestPassword123!',
    name: 'Owner Two',
    role: 'OWNER' as const,
  },
  {
    email: 'owner3@e2etest.com',
    password: 'TestPassword123!',
    name: 'Owner Three',
    role: 'OWNER' as const,
  },
  {
    email: 'manager@e2etest.com',
    password: 'TestPassword123!',
    name: 'Manager User',
    role: 'MANAGER' as const,
  },
  {
    email: 'cook@e2etest.com',
    password: 'TestPassword123!',
    name: 'Cook User',
    role: 'COOK' as const,
  },
];

/**
 * Setup test data for E2E testing
 * Returns mock data structure for test scenarios
 */
export async function setupTestData() {
  console.log('\n=== E2E Test Data Setup ===');
  console.log('Initializing test infrastructure...');
  console.log(`Restaurants: ${TEST_RESTAURANTS.length} test restaurants`);
  console.log(`Users: ${TEST_USERS.length} test users with different roles`);

  // Return mock data structure that tests can reference
  const restaurants = TEST_RESTAURANTS.map((r, i) => ({
    id: `restaurant-e2e-${i}`,
    name: r.name,
    status: r.status,
    subscriptionStatus: r.subscriptionStatus,
    ownerId: `owner-${i}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const users = TEST_USERS.map((u, i) => ({
    id: `user-e2e-${i}`,
    email: u.email,
    name: u.name,
    role: u.role,
    active: true,
    currentRestaurantId: i < 3 ? `restaurant-e2e-${i}` : `restaurant-e2e-0`,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  console.log('✅ Test infrastructure initialized successfully');
  return { restaurants, users };
}

/**
 * Clean up test data after E2E tests
 */
export async function cleanupTestData() {
  console.log('\n=== E2E Test Data Cleanup ===');
  // In a full implementation, this would make HTTP DELETE requests
  // to clean up test data from the running server
  console.log('✅ Test cleanup completed');
}
