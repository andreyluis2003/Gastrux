import { test, expect, TEST_USER } from './fixtures';

test.describe('Authentication Flow', () => {
  test('should sign up a new user', async ({ page }) => {
    await page.goto('/auth/signup');
    
    // Fill in the signup form
    await page.fill('input[type="email"]', `user-${Date.now()}@example.com`);
    await page.fill('input[type="password"]', 'Test@1234567');
    await page.fill('input[name="name"]', 'Test User');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to signin or dashboard
    await page.waitForURL(/(\/auth\/signin|\/dashboard)/);
    expect(page.url()).toContain('signin');
  });

  test('should sign in with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Fill in credentials
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await page.waitForURL('/dashboard');
    expect(page.url()).toContain('dashboard');
  });

  test('should fail with invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Fill in invalid credentials
    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Should stay on signin page
    await page.waitForTimeout(1000);
    expect(page.url()).toContain('signin');
  });
});
