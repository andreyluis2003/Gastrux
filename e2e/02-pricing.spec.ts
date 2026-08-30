import { test, expect } from './fixtures';

test.describe('Pricing Page', () => {
  test('should display all pricing tiers', async ({ page }) => {
    await page.goto('/pricing');
    
    // Check all tier cards are visible
    await expect(page.locator('text=Starter')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
    await expect(page.locator('text=Business')).toBeVisible();
    await expect(page.locator('text=Enterprise')).toBeVisible();
  });

  test('should display correct prices', async ({ page }) => {
    await page.goto('/pricing');
    
    // Check prices are visible
    await expect(page.locator('text=R$0')).toBeVisible(); // Starter
    await expect(page.locator('text=R$99')).toBeVisible(); // Pro
    await expect(page.locator('text=R$249')).toBeVisible(); // Business
    await expect(page.locator('text=R$499')).toBeVisible(); // Enterprise
  });

  test('should show comparison table when clicked', async ({ page }) => {
    await page.goto('/pricing');
    
    // Find and click the comparison toggle
    const toggleButton = page.locator('button:has-text("Comparação Completa")');
    await toggleButton.click();
    
    // Table should appear
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Recurso")')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pricing');
    
    // All pricing cards should still be visible
    await expect(page.locator('text=Starter')).toBeVisible();
    await expect(page.locator('text=R$0')).toBeVisible();
  });
});
