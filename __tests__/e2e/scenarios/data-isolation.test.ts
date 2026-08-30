import { test, expect } from '@playwright/test';
import { setupTestData, cleanupTestData, TEST_USERS, TEST_RESTAURANTS } from '../fixtures/test-data';

let testContext: any = {};

test.describe('E2E: Data Isolation Tests', () => {
  test.beforeAll(async () => {
    console.log('\n🏪 Setting up test data for data isolation scenarios...');
    testContext = await setupTestData();
  });

  test.afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData();
  });

  test('✅ Test infrastructure: 3 restaurants created', () => {
    expect(testContext.restaurants).toBeDefined();
    expect(testContext.restaurants).toHaveLength(3);
    expect(testContext.restaurants[0].name).toContain('Pizzaria');
    expect(testContext.restaurants[1].name).toContain('Burger');
    expect(testContext.restaurants[2].name).toContain('Sushi');
  });

  test('✅ Test infrastructure: 5 test users with roles', () => {
    expect(testContext.users).toBeDefined();
    expect(testContext.users).toHaveLength(5);
    
    const ownerUsers = testContext.users.filter((u: any) => u.role === 'OWNER');
    const managerUsers = testContext.users.filter((u: any) => u.role === 'MANAGER');
    const cookUsers = testContext.users.filter((u: any) => u.role === 'COOK');
    
    expect(ownerUsers).toHaveLength(3);
    expect(managerUsers).toHaveLength(1);
    expect(cookUsers).toHaveLength(1);
  });

  test('✅ Scenario 1.1: Users linked to correct restaurants', () => {
    const owner1 = testContext.users[0];
    const owner2 = testContext.users[1];
    const owner3 = testContext.users[2];
    
    // Each owner should be linked to a different restaurant
    expect(owner1.currentRestaurantId).toBe('restaurant-e2e-0');
    expect(owner2.currentRestaurantId).toBe('restaurant-e2e-1');
    expect(owner3.currentRestaurantId).toBe('restaurant-e2e-2');
  });

  test('✅ Scenario 1.2: Managers and cooks linked to first restaurant', () => {
    const manager = testContext.users.find((u: any) => u.role === 'MANAGER');
    const cook = testContext.users.find((u: any) => u.role === 'COOK');
    
    // Non-owner users should be linked to first restaurant for testing
    expect(manager?.currentRestaurantId).toBe('restaurant-e2e-0');
    expect(cook?.currentRestaurantId).toBe('restaurant-e2e-0');
  });

  test('✅ Scenario 1.3: Restaurants have unique IDs', () => {
    const ids = testContext.restaurants.map((r: any) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('✅ Scenario 1.4: Data structure verification', () => {
    testContext.restaurants.forEach((restaurant: any) => {
      expect(restaurant).toHaveProperty('id');
      expect(restaurant).toHaveProperty('name');
      expect(restaurant).toHaveProperty('status');
      expect(restaurant).toHaveProperty('ownerId');
    });

    testContext.users.forEach((user: any) => {
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('currentRestaurantId');
    });
  });
});

test.describe('E2E: API Endpoint Validation', () => {
  test('✅ 3.1 Server is running on localhost:3000', async ({ page }) => {
    const response = await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
    }).catch(() => null);
    
    expect(response).not.toBeNull();
  });

  test('✅ 3.2 Protected endpoints require authentication', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/ingredients', {
      headers: {},
    });
    
    // Should return 401 or redirect to login
    expect([401, 302, 307]).toContain(response.status());
  });
});
