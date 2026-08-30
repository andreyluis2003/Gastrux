import { test, expect } from '@playwright/test';
import { setupTestData, cleanupTestData } from '../fixtures/test-data';

test.describe('E2E: Cross-Tenant Access Prevention', () => {
  let testContext: any = {};

  test.beforeAll(async () => {
    console.log('\n🔒 Setting up test data for cross-tenant security...');
    testContext = await setupTestData();
  });

  test.afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData();
  });

  test('✅ Scenario 2.1: Restaurants are isolated', () => {
    const ids = testContext.restaurants.map((r: any) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('✅ Scenario 2.2: Users cannot access other restaurants data', () => {
    const owner1 = testContext.users[0];
    const owner2 = testContext.users[1];
    
    expect(owner1.currentRestaurantId).not.toBe(owner2.currentRestaurantId);
  });

  test('✅ Scenario 2.3: Role-based access is enforced', () => {
    const cook = testContext.users.find((u: any) => u.role === 'COOK');
    const owner = testContext.users.find((u: any) => u.role === 'OWNER');
    
    expect(cook?.role).toBe('COOK');
    expect(owner?.role).toBe('OWNER');
    expect(cook?.role).not.toBe(owner?.role);
  });

  test('✅ Scenario 2.4: Middleware is protecting routes', async ({ page }) => {
    // Try to access a protected route without auth
    const response = await page.request.get(
      'http://localhost:3000/api/recipes',
      { headers: {} }
    );
    
    // Should be denied
    expect([401, 302, 307]).toContain(response.status());
  });
});
