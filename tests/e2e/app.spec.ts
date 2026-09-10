import { expect, test, type Page } from '@playwright/test';

async function fillForm(page: Page, n: string, total: string, capacity: string) {
  await page.getByTestId('input-n').fill(n);
  await page.getByTestId('input-total').fill(total);
  await page.getByTestId('input-capacity').fill(capacity);
}

async function stepAmounts(page: Page): Promise<number[]> {
  const texts = await page.getByTestId('step-amount').allTextContents();
  return texts.map((t) => Number.parseInt(t, 10));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('合法输入：显示浓缩液、清水与分次量取步骤，合计严格等于目标总量', async ({ page }) => {
  await fillForm(page, '4', '1000', '300');

  await expect(page.getByTestId('result-concentrate')).toHaveText('200 mL');
  await expect(page.getByTestId('result-water')).toHaveText('800 mL');
  await expect(page.getByTestId('result-total')).toHaveText('1000 mL');

  // 浓缩液 200 → 1 步；清水 800 → 300 + 300 + 200，共 4 步
  await expect(page.getByTestId('measure-step')).toHaveCount(4);
  const amounts = await stepAmounts(page);
  expect(amounts).toEqual([200, 300, 300, 200]);

  // 每一步不超容量，合计严格等于目标总量
  for (const amount of amounts) {
    expect(amount).toBeLessThanOrEqual(300);
  }
  expect(amounts.reduce((a, b) => a + b, 0)).toBe(1000);
  await expect(page.getByTestId('steps-sum')).toContainText('✓');
});

test('0.5 mL 边界取整：102 mL 的 1+3 → 浓缩液 26 mL、清水 76 mL', async ({ page }) => {
  await fillForm(page, '3', '102', '5000');
  await expect(page.getByTestId('result-concentrate')).toHaveText('26 mL');
  await expect(page.getByTestId('result-water')).toHaveText('76 mL');
  await expect(page.getByTestId('result-exact')).toContainText('25.50');
});

test('非法字段就地反馈，且不保留旧配液卡', async ({ page }) => {
  await fillForm(page, '4', '1000', '300');
  await expect(page.getByTestId('result-card')).toBeVisible();

  await page.getByTestId('input-n').fill('0');
  await expect(page.getByTestId('error-n')).toBeVisible();
  await expect(page.getByTestId('result-card')).toHaveCount(0);
  await expect(page.getByTestId('print-card')).toHaveCount(0);

  await page.getByTestId('input-n').fill('4');
  await expect(page.getByTestId('result-card')).toBeVisible();

  await page.getByTestId('input-total').fill('5001');
  await expect(page.getByTestId('error-total')).toBeVisible();
  await expect(page.getByTestId('result-card')).toHaveCount(0);

  await page.getByTestId('input-total').fill('1000');
  await page.getByTestId('input-capacity').fill('10.5');
  await expect(page.getByTestId('error-capacity')).toBeVisible();
  await expect(page.getByTestId('result-card')).toHaveCount(0);
});

test('液体恰好等于量筒容量整数倍时，不出现零余量步骤', async ({ page }) => {
  // 浓缩液 200、清水 800，容量 200 → 1 + 4 步，全部满量筒
  await fillForm(page, '4', '1000', '200');
  const amounts = await stepAmounts(page);
  expect(amounts).toEqual([200, 200, 200, 200, 200]);
  await expect(page.getByTestId('measure-step')).toHaveCount(5);
  await expect(page.locator('text=/量取 0 mL/')).toHaveCount(0);
});

test('量取步骤可逐项勾选并更新进度', async ({ page }) => {
  await fillForm(page, '4', '1000', '300');
  const boxes = page.getByTestId('step-checkbox');
  await expect(boxes).toHaveCount(4);
  await expect(page.getByTestId('steps-progress')).toContainText('0/4');

  await boxes.nth(0).check();
  await boxes.nth(2).check();
  await expect(page.getByTestId('steps-progress')).toContainText('2/4');

  await boxes.nth(0).uncheck();
  await expect(page.getByTestId('steps-progress')).toContainText('1/4');
});

test('配液卡包含全部步骤且合计等于目标总量', async ({ page }) => {
  await fillForm(page, '9', '2500', '400');
  const card = page.getByTestId('print-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('1+9');
  await expect(card).toContainText('250 mL'); // 浓缩液 2500/10
  await expect(card).toContainText('2250 mL'); // 清水
  await expect(card).toContainText('2500 mL'); // 合计行
});
