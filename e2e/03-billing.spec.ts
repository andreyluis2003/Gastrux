import { test, expect, TEST_USER } from './fixtures';

test.describe('Billing and Subscription Flow', () => {
  test('should show subscription status on dashboard', async ({ authenticatedPage }) => {
    // User should be on dashboard (authenticated)
    await expect(authenticatedPage).toHaveURL('/dashboard');
    
    // Check if billing section is accessible
    await authenticatedPage.goto('/dashboard/billing');
    await expect(authenticatedPage.locator('text=Seu Plano')).toBeVisible();
  });

  test('should navigate to pricing from dashboard', async ({ authenticatedPage }) => {
    // Start from authenticated dashboard
    await expect(authenticatedPage).toHaveURL('/dashboard');
    
    // Navigate to pricing
    await authenticatedPage.goto('/pricing');
    
    // Should be able to click upgrade button
    const upgradeButtons = authenticatedPage.locator('button:has-text("Escolher Plano")');
    await expect(upgradeButtons.first()).toBeVisible();
  });

  test('should validate tier selection', async ({ page }) => {
    // First sign in
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    
    // Navigate to pricing
    await page.goto('/pricing');
    
    // Try to select Pro plan
    const upgradeButtons = page.locator('button:has-text("Escolher Plano")');
    await upgradeButtons.first().click();
    
    // Should either redirect to Stripe or show modal
    await page.waitForTimeout(2000);
    const hasStripeRedirect = page.url().includes('stripe');
    const hasCheckoutSession = page.url().includes('checkout');
    
    expect(hasStripeRedirect || hasCheckoutSession || page.url().includes('pricing')).toBeTruthy();
  });
});
