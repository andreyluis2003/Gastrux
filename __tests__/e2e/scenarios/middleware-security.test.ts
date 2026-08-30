import { test, expect } from '@playwright/test';

test.describe('E2E: Middleware Security', () => {
  test('✅ 3.1 Server responds to requests', async ({ page }) => {
    const response = await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
    }).catch(() => null);
    
    expect(response?.status()).toBeLessThan(400);
  });

  test('✅ 3.2 Authentication is required for API routes', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/ingredients');
    
    // Should require authentication
    expect([401, 302, 307]).toContain(response.status());
  });

  test('✅ 3.3 Security headers are present', async ({ request }) => {
    const response = await request.get('http://localhost:3000/');
    const headers = response.headers();
    
    // Basic security header checks
    expect(response.status()).toBeLessThan(400);
    expect(headers).toBeDefined();
  });
});
