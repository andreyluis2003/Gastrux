import { test, expect } from '@playwright/test';
import { setupTestData, cleanupTestData, TEST_USERS } from '../fixtures/test-data';

test.describe('E2E: Role-Based Access Control', () => {
  let testContext: any = {};

  test.beforeAll(async () => {
    console.log('\n🔐 Setting up test data for RBAC validation...');
    testContext = await setupTestData();
  });

  test.afterAll(async () => {
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData();
  });

  test('✅ 4.1 OWNER role is identified', () => {
    const owners = testContext.users.filter((u: any) => u.role === 'OWNER');
    expect(owners).toHaveLength(3);
    owners.forEach((owner: any) => {
      expect(owner.email).toContain('@e2etest.com');
    });
  });

  test('✅ 4.2 MANAGER role is identified', () => {
    const managers = testContext.users.filter((u: any) => u.role === 'MANAGER');
    expect(managers).toHaveLength(1);
    expect(managers[0].name).toContain('Manager');
  });

  test('✅ 4.3 COOK role is identified', () => {
    const cooks = testContext.users.filter((u: any) => u.role === 'COOK');
    expect(cooks).toHaveLength(1);
    expect(cooks[0].name).toContain('Cook');
  });

  test('✅ 4.4 Roles are distinct', () => {
    const roles = new Set(testContext.users.map((u: any) => u.role));
    expect(roles.size).toBeGreaterThanOrEqual(3);
    expect(roles.has('OWNER')).toBe(true);
    expect(roles.has('MANAGER')).toBe(true);
    expect(roles.has('COOK')).toBe(true);
  });

  test('✅ 4.5 Each user has correct role assigned', () => {
    TEST_USERS.forEach((testUser, index) => {
      const user = testContext.users[index];
      expect(user.role).toBe(testUser.role);
    });
  });
});
