import { test as base, Page } from '@playwright/test';

/**
 * Test credentials for E2E testing
 */
export const TEST_USER = {
  email: 'e2etest@example.com',
  password: 'Test@1234567',
  name: 'E2E Test User',
};

export const TEST_ADMIN = {
  email: 'admin@restaurantes.test',
  password: 'AdminTest@1234',
  name: 'Admin Test',
};

/**
 * Custom test fixture that handles authentication
 */
type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Sign in before test
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard');
    
    // Use the authenticated page in tests
    await use(page);
    
    // Sign out after test
    await page.goto('/auth/signout');
  },
});

export { expect } from '@playwright/test';
