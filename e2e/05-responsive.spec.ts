import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  const testViewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1440, height: 900 },
  ];

  testViewports.forEach(({ name, width, height }) => {
    test(`pricing page should be responsive on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/pricing');
      
      // Check that all pricing cards are visible
      await expect(page.locator('text=Starter')).toBeVisible();
      await expect(page.locator('text=R$0')).toBeVisible();
      
      // Check no horizontal scrollbar
      const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const windowWidth = width;
      expect(bodyWidth).toBeLessThanOrEqual(windowWidth);
    });

    test(`dashboard should be responsive on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/dashboard');
      
      // Check main content is visible
      const mainContent = page.locator('main');
      await expect(mainContent).toBeVisible();
      
      // Check no horizontal scrollbar
      const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(width);
    });
  });
});
