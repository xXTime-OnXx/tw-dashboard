import { test, expect } from '@playwright/test';
test('player perspective, profiles, notes, filters and narrow layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?perspective=1');
  await expect(page.getByRole('heading', { name: 'Field intelligence' })).toBeVisible();
  await page.getByRole('button', { name: /Rival & Co/ }).click();
  await expect(page.getByRole('heading', { name: 'Rival & Co', exact: true })).toBeVisible();
  const note = `Observe northern expansion · ${Date.now()}`;
  await page.getByLabel('Private notes').fill(note);
  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Private notes')).toHaveValue(note);
  await expect(page).toHaveURL(/perspective=1/);
  await page.getByRole('button', { name: 'Close profile' }).click();
  await page.getByLabel('Filter opponents').fill('Boundary');
  await expect(page.getByRole('button', { name: /Boundary/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Rival & Co/ })).toHaveCount(0);
  await page.setViewportSize({ width: 700, height: 1000 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-700.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('map and data status load without uncaught errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?perspective=1&view=map');
  await expect(page.getByLabel('Map coordinate')).toBeVisible();
  await page.getByLabel('Map coordinate').fill('510|500');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByTestId('map-count')).toHaveText('7 villages');
  // At 510|500 the central marker is Rival's village; the far-away village is outside the viewport.
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw Error('Map canvas has no bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('heading', { name: 'Rival & Co', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/map.png', fullPage: true });
  await page.getByRole('button', { name: 'Data status' }).click();
  await expect(page.getByRole('heading', { name: 'Collection health' })).toBeVisible();
  expect(errors).toEqual([]);
});
