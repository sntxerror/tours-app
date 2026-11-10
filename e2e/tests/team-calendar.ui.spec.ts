import { expect, test, type Page } from '@playwright/test';
import { USERS, createRequest, decide, login, nearFutureRange } from '../support/api';
import { monthLabel, rangeLabel, rangeSource, signIn } from '../support/ui';

const monthHeading = (page: Page) => page.getByRole('heading', { level: 2 });

/** Clicks forward from the current month (UTC, as the app counts it) to the month of `isoDate`. */
async function goToMonthOf(page: Page, isoDate: string): Promise<void> {
  const now = new Date();
  const [year, month] = isoDate.split('-').map(Number);
  const steps = (year - now.getUTCFullYear()) * 12 + (month - 1 - now.getUTCMonth());
  for (let i = 0; i < steps; i++) await page.getByRole('button', { name: 'Next month' }).click();
  await expect(monthHeading(page)).toHaveText(monthLabel(isoDate));
}

test.describe('team calendar', () => {
  test('opens on the current month and moves back to it with "Today"', async ({
    page,
    request,
  }) => {
    await signIn(page, await login(request, USERS.alice));
    await page.goto('/team');
    const today = new Date().toISOString().slice(0, 10);
    await expect(monthHeading(page)).toHaveText(monthLabel(today));

    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(monthHeading(page)).not.toHaveText(monthLabel(today));
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(monthHeading(page)).toHaveText(monthLabel(today));

    await page.getByRole('button', { name: 'Previous month' }).click();
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(monthHeading(page)).toHaveText(monthLabel(today));
  });

  test('shows an approved vacation to its owner (marked "you") without its reason', async ({
    page,
    request,
  }) => {
    const erin = await login(request, USERS.erin);
    const range = nearFutureRange();
    const { id } = await createRequest(request, erin, {
      ...range,
      reason: 'secret-medical-reason',
    });
    await decide(request, await login(request, USERS.carol), id, 'approve', 'secret-comment');

    await signIn(page, erin);
    await page.goto('/team');
    await goToMonthOf(page, range.startDate);

    const row = page.getByRole('row').filter({ hasText: 'Erin Nguyen' });
    await expect(row).toContainText('(you)');
    await expect(row).toContainText(new RegExp(`away ${rangeSource(range)}`));
    await expect(page.locator('body')).not.toContainText('secret-medical-reason');
    await expect(page.locator('body')).not.toContainText('secret-comment');
  });

  test('shows the same vacation to a validator, who is not "you"', async ({ page, request }) => {
    const range = nearFutureRange();
    const { id } = await createRequest(request, await login(request, USERS.erin), range);
    const carol = await login(request, USERS.carol);
    await decide(request, carol, id, 'approve');

    await signIn(page, carol);
    await page.goto('/team');
    await goToMonthOf(page, range.startDate);

    const row = page.getByRole('row').filter({ hasText: 'Erin Nguyen' });
    await expect(row).toContainText(new RegExp(`away ${rangeSource(range)}`));
    await expect(row).not.toContainText('(you)');
  });

  test('does not show pending or rejected requests', async ({ page, request }) => {
    const erin = await login(request, USERS.erin);
    const carol = await login(request, USERS.carol);
    const pending = nearFutureRange();
    const rejected = nearFutureRange();
    await createRequest(request, erin, pending);
    const { id } = await createRequest(request, erin, rejected);
    await decide(request, carol, id, 'reject', 'No');

    await signIn(page, carol);
    await page.goto('/team');
    await goToMonthOf(page, pending.startDate);

    await expect(page.locator('body')).not.toContainText(rangeLabel(pending));
    await expect(page.locator('body')).not.toContainText(rangeLabel(rejected));
  });

  test('the calendar is reachable from the navigation', async ({ page, request }) => {
    await signIn(page, await login(request, USERS.carol));
    await page.goto('/dashboard');

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Team calendar' })
      .click();

    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { name: 'Team calendar' })).toBeVisible();
  });
});
