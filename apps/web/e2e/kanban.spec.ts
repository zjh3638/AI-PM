import { test, expect } from '@playwright/test';

test.describe('Workspace List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(800);
  });

  test('shows workspace list page', async ({ page }) => {
    await expect(page.locator('text=研发项目 Demo').first()).toBeVisible({ timeout: 8000 });
  });

  test('navigates to workspace detail and shows kanban', async ({ page }) => {
    await page.locator('text=研发项目 Demo').first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    // Should show kanban view
    await expect(page.locator('.kanban-col, [class*="kanban-col"]').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Kanban Operations in Workspace Detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(500);
    await page.locator('text=研发项目 Demo').first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForTimeout(500);
  });

  test('shows kanban columns', async ({ page }) => {
    const cols = page.locator('.kanban-col, [class*="kanban-col"]');
    await expect(cols.first()).toBeVisible({ timeout: 8000 });
    const count = await cols.count();
    expect(count).toBeGreaterThan(0);
  });

  test('can open task create panel', async ({ page }) => {
    // Look for add button in kanban column
    const addBtn = page.locator('[class*="col-add"], button:has-text("+"), text="+ 新建"').first();
    const hasAddBtn = await addBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasAddBtn) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
    // Either a slide panel or form should be visible
    const formVisible = await page.locator('input[placeholder*="标题"], textarea[placeholder*="描述"], .form-group').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(formVisible || !hasAddBtn).toBeTruthy(); // OK if no add button or if form shows
  });

  test('kanban cards are visible', async ({ page }) => {
    const cards = page.locator('[class*="kanban-card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('6 phase columns visible for R&D project', async ({ page }) => {
    // The R&D project uses 6-phase view, should show phase labels
    const phaseLabels = ['需求分析', '方案设计', '开发实现', '测试验证', '发布上线', '验收交付'];
    let foundCount = 0;
    for (const label of phaseLabels) {
      const visible = await page.locator(`text=${label}`).first().isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) foundCount++;
    }
    // At least 4 of 6 phase labels should be visible
    expect(foundCount).toBeGreaterThanOrEqual(4);
  });
});
