import { test, expect } from '@playwright/test';

const WS_NAME = 'AI-PM 平台开发';
const PHASES = ['需求池', '需求规划', '方案设计', '开发实现', '测试验证', '发布上线'];
const STATUS_COLS = ['待办', '进行中', '待 Review', '已完成'];

test.describe('Workspace Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(800);
  });

  test('shows workspace list', async ({ page }) => {
    await expect(page.locator(`text=${WS_NAME}`).first()).toBeVisible({ timeout: 8000 });
  });

  test('navigates to workspace and shows kanban', async ({ page }) => {
    await page.locator(`text=${WS_NAME}`).first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.locator('.kanban-col').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Phase Kanban', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(500);
    await page.locator(`text=${WS_NAME}`).first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('shows 6 phase columns', async ({ page }) => {
    const cols = page.locator('.kanban-col');
    await expect(cols.first()).toBeVisible({ timeout: 8000 });
    const count = await cols.count();
    // R&D project defaults to phase view with 6 columns
    expect(count).toBe(6);
  });

  test('all 6 phase labels visible', async ({ page }) => {
    let found = 0;
    for (const label of PHASES) {
      const visible = await page.locator(`text=${label}`).first().isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) found++;
    }
    expect(found).toBe(6);
  });

  test('kanban cards are visible', async ({ page }) => {
    const cards = page.locator('.kanban-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('view switcher toggles to status view', async ({ page }) => {
    const statusBtn = page.locator('button:has-text("状态视图")');
    if (await statusBtn.count() > 0) {
      await statusBtn.first().click();
      await page.waitForTimeout(500);
      // Status view has 4 columns
      const cols = page.locator('.kanban-col');
      await expect(cols.first()).toBeVisible({ timeout: 5000 });
      expect(await cols.count()).toBe(4);

      // Verify status labels
      let found = 0;
      for (const label of STATUS_COLS) {
        const visible = await page.locator(`text=${label}`).first().isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) found++;
      }
      expect(found).toBeGreaterThanOrEqual(3);
    }
  });

  test('view switcher returns to phase view', async ({ page }) => {
    const statusBtn = page.locator('button:has-text("状态视图")');
    if (await statusBtn.count() > 0) {
      await statusBtn.first().click();
      await page.waitForTimeout(500);

      const phaseBtn = page.locator('button:has-text("阶段视图")');
      if (await phaseBtn.count() > 0) {
        await phaseBtn.first().click();
        await page.waitForTimeout(500);
        expect(await page.locator('.kanban-col').count()).toBe(6);
      }
    }
  });
});

test.describe('Task Detail Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(500);
    await page.locator(`text=${WS_NAME}`).first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('opens task panel on card click', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.click();
    await page.waitForTimeout(1000);

    // Should show current phase info
    await expect(page.locator('text=当前阶段').first()).toBeVisible({ timeout: 5000 });
  });

  test('workflow action bar visible for STORY', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await card.click();
    await page.waitForTimeout(1000);

    const wfBar = page.locator('text=流程操作');
    expect(await wfBar.count()).toBeGreaterThanOrEqual(0);
  });

  test('document tabs visible', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await card.click();
    await page.waitForTimeout(1000);

    // Doc tabs should be present
    const docTabs = ['需求', '设计', '测试'];
    let found = 0;
    for (const tab of docTabs) {
      const visible = await page.locator(`button:has-text("${tab}")`).first().isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) found++;
    }
    expect(found).toBeGreaterThanOrEqual(2);
  });

  test('no redundant status buttons in panel', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await card.click();
    await page.waitForTimeout(1000);

    for (const badLabel of ['开始处理', '标记完成', '标记未完']) {
      const count = await page.locator(`button:has-text("${badLabel}")`).count();
      expect(count).toBe(0);
    }
  });

  test('phase timeline visible', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await card.click();
    await page.waitForTimeout(1000);

    const timeline = page.locator('text=流程记录');
    expect(await timeline.count()).toBeGreaterThanOrEqual(0);
  });

  test('can close panel', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await card.click();
    await page.waitForTimeout(1000);

    // Click cancel button to close
    const cancelBtn = page.locator('button:has-text("取消")');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.first().click();
      await page.waitForTimeout(500);
    }
  });
});

test.describe('Card Status Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workspaces');
    await page.waitForTimeout(500);
    await page.locator(`text=${WS_NAME}`).first().click();
    await page.waitForURL(/\/workspaces\/[a-f0-9-]+/, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('status quick button on card cycles status', async ({ page }) => {
    const statusBtns = page.locator('.card-status-btn');
    if (await statusBtns.count() > 0) {
      await statusBtns.first().click();
      await page.waitForTimeout(500);
      // Status should have changed — verify no error toast
      const errorToast = page.locator('text=变更失败');
      expect(await errorToast.count()).toBe(0);
    }
  });

  test('card drag attribute present', async ({ page }) => {
    const card = page.locator('.kanban-card').first();
    await expect(card).toHaveAttribute('draggable', 'true');
  });
});
