import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="username"][placeholder*="用户"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="请输入密码"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("登 录")').first()).toBeVisible({ timeout: 3000 });
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"][placeholder*="用户"]').fill('wrong');
    await page.locator('input[placeholder="请输入密码"]').fill('wrong');
    await page.locator('button:has-text("登 录")').first().click();
    await page.waitForTimeout(2000);
    // Page should stay on login
    expect(page.url()).toContain('/login');
  });

  test('redirects to dashboard after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="username"][placeholder*="用户"]').fill('admin');
    await page.locator('input[placeholder="请输入密码"]').fill('admin123');
    await page.locator('button:has-text("登 录")').first().click();
    await page.waitForURL(/^(?!.*\/login).*$/, { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });
});

test.describe('Authenticated Navigation', () => {
  test('can access dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/login');
  });

  test('can access workspace list', async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain('/login');
  });
});
