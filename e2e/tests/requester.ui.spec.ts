import { expect, test } from '@playwright/test';
import { USERS, createRequest, daysFromToday, decide, futureRange, login } from '../support/api';
import {
  expectNotice,
  fillPeriod,
  rangeLabel,
  rangeSource,
  requestRow,
  signIn,
} from '../support/ui';

// Dave is reserved for the requester UI specs (see `USERS`): these tests read his list.
test.beforeEach(async ({ page, request }) => {
  await signIn(page, await login(request, USERS.dave));
  await page.goto('/my-requests');
  await expect(page.getByRole('heading', { name: 'My vacation requests' })).toBeVisible();
});

test.describe('submitting a request', () => {
  test('adds it to the list as pending and clears the form', async ({ page }) => {
    const range = futureRange(4);
    await fillPeriod(page, range);
    await page.getByLabel('Reason').fill('Skiing trip');
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expectNotice(page, new RegExp(`Request for ${rangeSource(range)} submitted.`));
    const row = requestRow(page, range);
    await expect(row).toContainText('Pending');
    await expect(row).toContainText('Skiing trip');
    await expect(row).toContainText('5 days');
    await expect(page.getByLabel('Start date')).toHaveValue('');
    await expect(page.getByLabel('Reason')).toHaveValue('');
  });

  test('the reason is optional', async ({ page }) => {
    const range = futureRange();
    await fillPeriod(page, range);
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(requestRow(page, range)).toContainText('Pending');
  });

  test('asks for both dates before sending anything', async ({ page }) => {
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(page.getByText('Start date is required.')).toBeVisible();
    await expect(page.getByText('End date is required.')).toBeVisible();
  });

  test('explains that the end date must be after the start date', async ({ page }) => {
    const { startDate } = futureRange();
    await fillPeriod(page, { startDate, endDate: startDate });
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(page.getByText('End date must be after the start date.')).toBeVisible();
  });

  test('explains that the start date cannot be in the past', async ({ page }) => {
    await fillPeriod(page, { startDate: daysFromToday(-5), endDate: daysFromToday(2) });
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(page.getByText('Start date cannot be in the past.')).toBeVisible();
  });

  test('shows the server error for dates that overlap an existing request', async ({
    page,
    request,
  }) => {
    const range = futureRange(5);
    await createRequest(request, await login(request, USERS.dave), range);

    await fillPeriod(page, range);
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(
      page.getByRole('region', { name: 'New request' }).getByRole('alert'),
    ).toContainText(/Dates overlap with your pending request/);
    // The input is kept so the user can adjust it.
    await expect(page.getByLabel('Start date')).toHaveValue(range.startDate);
  });
});

test.describe('the request list', () => {
  test('shows a request made elsewhere after a reload', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), {
      ...range,
      reason: 'Made through the API',
    });

    await page.reload();

    const row = requestRow(page, range);
    await expect(row).toContainText('Made through the API');
    await expect(row).toContainText('Pending');
  });

  test('approved requests are final: no edit or cancel actions', async ({ page, request }) => {
    const dave = await login(request, USERS.dave);
    const range = futureRange();
    const { id } = await createRequest(request, dave, range);
    await decide(request, await login(request, USERS.carol), id, 'approve');

    await page.reload();

    const row = requestRow(page, range);
    await expect(row).toContainText('Approved');
    await expect(row.getByRole('button')).toHaveCount(0);
  });

  test('a rejected request shows the validator comment and no actions', async ({
    page,
    request,
  }) => {
    const dave = await login(request, USERS.dave);
    const range = futureRange();
    const { id } = await createRequest(request, dave, range);
    await decide(request, await login(request, USERS.carol), id, 'reject', 'Team is short-staffed');

    await page.reload();

    const row = requestRow(page, range);
    await expect(row).toContainText('Rejected');
    await expect(row).toContainText('Team is short-staffed');
    await expect(row.getByRole('button')).toHaveCount(0);
  });

  test('filters by status', async ({ page, request }) => {
    const dave = await login(request, USERS.dave);
    const carol = await login(request, USERS.carol);
    const approvedRange = futureRange();
    const pendingRange = futureRange();
    const { id } = await createRequest(request, dave, approvedRange);
    await createRequest(request, dave, pendingRange);
    await decide(request, carol, id, 'approve');
    await page.reload();
    await expect(requestRow(page, pendingRange)).toBeVisible();

    await page.getByLabel('Status').selectOption('Approved');

    await expect(requestRow(page, approvedRange)).toBeVisible();
    await expect(requestRow(page, pendingRange)).toHaveCount(0);

    await page.getByLabel('Status').selectOption('Pending');

    await expect(requestRow(page, pendingRange)).toBeVisible();
    await expect(requestRow(page, approvedRange)).toHaveCount(0);
  });
});

test.describe('editing a pending request', () => {
  test('saves the new reason and dates', async ({ page, request }) => {
    const range = futureRange(3);
    const newRange = futureRange(6);
    await createRequest(request, await login(request, USERS.dave), { ...range, reason: 'Before' });
    await page.reload();

    await requestRow(page, range).getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit request' });
    await expect(dialog.getByLabel('Start date')).toHaveValue(range.startDate);
    await expect(dialog.getByLabel('Reason')).toHaveValue('Before');
    await fillPeriod(dialog, newRange);
    await dialog.getByLabel('Reason').fill('After');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog).toHaveCount(0);
    await expectNotice(page, 'Request updated.');
    const row = requestRow(page, newRange);
    await expect(row).toContainText('After');
    await expect(requestRow(page, range)).toHaveCount(0);
  });

  test('clearing the reason removes it', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), { ...range, reason: 'Temp' });
    await page.reload();

    await requestRow(page, range).getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit request' });
    await dialog.getByLabel('Reason').fill('');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expectNotice(page, 'Request updated.');
    await expect(requestRow(page, range)).not.toContainText('Temp');
  });

  test('Escape closes the dialog without saving', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), { ...range, reason: 'Keep me' });
    await page.reload();

    await requestRow(page, range).getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit request' });
    await dialog.getByLabel('Reason').fill('Discarded');
    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(requestRow(page, range)).toContainText('Keep me');
  });

  test('keeps the dialog open and shows why when the request was decided meanwhile', async ({
    page,
    request,
  }) => {
    const range = futureRange();
    const { id } = await createRequest(request, await login(request, USERS.dave), range);
    await page.reload();
    await requestRow(page, range).getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit request' });

    await decide(request, await login(request, USERS.carol), id, 'approve');
    await dialog.getByLabel('Reason').fill('Too late');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog.getByRole('alert')).toContainText('Approved requests cannot be modified');
    await expect(dialog).toBeVisible();
  });
});

test.describe('cancelling a pending request', () => {
  test('removes it after confirmation', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), range);
    await page.reload();

    await requestRow(page, range).getByRole('button', { name: 'Cancel', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel request' });
    await expect(dialog).toContainText(rangeLabel(range));
    await dialog.getByRole('button', { name: 'Cancel request' }).click();

    await expect(dialog).toHaveCount(0);
    await expectNotice(page, 'Request cancelled.');
    await expect(requestRow(page, range)).toHaveCount(0);
  });

  test('"Keep it" leaves the request alone', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), range);
    await page.reload();

    await requestRow(page, range).getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Cancel request' })
      .getByRole('button', { name: 'Keep it' })
      .click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(requestRow(page, range)).toContainText('Pending');
  });

  test('the freed dates can be requested again', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.dave), range);
    await page.reload();
    await requestRow(page, range).getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click();
    await expect(requestRow(page, range)).toHaveCount(0);

    await fillPeriod(page, range);
    await page.getByRole('button', { name: 'Submit request' }).click();

    await expect(requestRow(page, range)).toContainText('Pending');
  });
});
