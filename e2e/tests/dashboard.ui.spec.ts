import { expect, test, type Page } from '@playwright/test';
import { USERS, createRequest, decide, futureRange, login } from '../support/api';
import { expectNotice, rangeLabel, requestRow, signIn } from '../support/ui';

// Erin is reserved for this file (see `USERS`): every test reads her list on the dashboard, and the
// pagination test at the end adds enough requests to push earlier ones off the first page. That is
// why the file runs serially, in order.
test.describe.configure({ mode: 'serial' });

const ERIN = 'Erin Nguyen';

/** Opens the dashboard narrowed to Erin, so only requests made by these tests are in the list. */
async function openDashboard(page: Page, status: 'Pending' | 'Approved' | 'Rejected' = 'Pending') {
  await page.goto('/dashboard');
  await page.getByLabel('Requester').selectOption({ label: ERIN });
  await page.getByLabel('Status').selectOption(status);
  await expect(page.getByLabel('Requester')).toHaveValue(/.+/);
}

test.beforeEach(async ({ page, request }) => {
  await signIn(page, await login(request, USERS.carol));
});

test.describe('listing requests', () => {
  test('shows pending requests with the requester by default', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), { ...range, reason: 'Wedding' });

    await page.goto('/dashboard');
    await expect(page.getByLabel('Status')).toHaveValue('Pending');
    await page.getByLabel('Requester').selectOption({ label: ERIN });

    const row = requestRow(page, range);
    await expect(row).toContainText(ERIN);
    await expect(row).toContainText('Wedding');
    await expect(row).toContainText('Pending');
  });

  test('keeps the filters in the URL, so a reload shows the same list', async ({
    page,
    request,
  }) => {
    const range = futureRange();
    const { id } = await createRequest(request, await login(request, USERS.erin), range);
    await decide(request, await login(request, USERS.carol), id, 'approve');

    await openDashboard(page, 'Approved');
    await expect(page).toHaveURL(/status=Approved/);
    await expect(page).toHaveURL(/userId=[0-9a-f-]{36}/);
    await expect(requestRow(page, range)).toContainText('Approved');

    await page.reload();

    await expect(page.getByLabel('Status')).toHaveValue('Approved');
    await expect(page.getByLabel('Requester')).toHaveValue(/.+/);
    await expect(requestRow(page, range)).toContainText('Approved');
  });

  test('the "All" status also lists decided requests', async ({ page, request }) => {
    const range = futureRange();
    const { id } = await createRequest(request, await login(request, USERS.erin), range);
    await decide(request, await login(request, USERS.carol), id, 'approve');

    await openDashboard(page, 'Pending');
    await expect(requestRow(page, range)).toHaveCount(0);

    await page.getByLabel('Status').selectOption('All');
    await expect(page).toHaveURL(/status=all/);
    await expect(requestRow(page, range)).toContainText('Approved');
  });

  test('decided requests have no actions', async ({ page, request }) => {
    const range = futureRange();
    const { id } = await createRequest(request, await login(request, USERS.erin), range);
    await decide(request, await login(request, USERS.carol), id, 'approve');

    await openDashboard(page, 'Approved');

    await expect(requestRow(page, range).getByRole('button')).toHaveCount(0);
  });
});

test.describe('approving', () => {
  test('approves with a comment and moves the request out of the pending list', async ({
    page,
    request,
  }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);

    await requestRow(page, range).getByRole('button', { name: 'Approve' }).click();
    const dialog = page.getByRole('dialog', { name: 'Approve request' });
    await expect(dialog).toContainText(ERIN);
    await expect(dialog).toContainText(rangeLabel(range));
    await dialog.getByLabel('Comment').fill('Enjoy!');
    await dialog.getByRole('button', { name: 'Approve' }).click();

    await expect(dialog).toHaveCount(0);
    await expectNotice(page, `Request from ${ERIN} approved.`);
    await expect(requestRow(page, range)).toHaveCount(0);

    await page.getByLabel('Status').selectOption('Approved');
    const row = requestRow(page, range);
    await expect(row).toContainText('Approved');
    await expect(row).toContainText('Enjoy!');
  });

  test('a comment is optional', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);

    await requestRow(page, range).getByRole('button', { name: 'Approve' }).click();
    await page
      .getByRole('dialog', { name: 'Approve request' })
      .getByRole('button', { name: 'Approve' })
      .click();

    await expectNotice(page, `Request from ${ERIN} approved.`);
  });

  test('closing the dialog decides nothing', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);

    await requestRow(page, range).getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(requestRow(page, range)).toContainText('Pending');
  });
});

test.describe('rejecting', () => {
  test('requires a comment', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);

    await requestRow(page, range).getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject request' });
    const reject = dialog.getByRole('button', { name: 'Reject' });
    await expect(dialog.getByText('A comment is required to reject a request.')).toBeVisible();
    await expect(reject).toBeDisabled();

    await dialog.getByLabel('Comment').fill('   ');
    await expect(reject).toBeDisabled();

    await dialog.getByLabel('Comment').fill('Peak season');
    await expect(reject).toBeEnabled();
  });

  test('rejects with the comment, which the requester then sees', async ({ page, request }) => {
    const range = futureRange();
    await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);

    await requestRow(page, range).getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject request' });
    await dialog.getByLabel('Comment').fill('Peak season');
    await dialog.getByRole('button', { name: 'Reject' }).click();

    await expectNotice(page, `Request from ${ERIN} rejected.`);
    await expect(requestRow(page, range)).toHaveCount(0);
    await page.getByLabel('Status').selectOption('Rejected');
    await expect(requestRow(page, range)).toContainText('Peak season');

    // The other side of the same decision.
    await signIn(page, await login(request, USERS.erin));
    await page.goto('/my-requests');
    const row = requestRow(page, range);
    await expect(row).toContainText('Rejected');
    await expect(row).toContainText('Peak season');
  });

  test('a request decided in the meantime is refreshed with an explanation', async ({
    page,
    request,
  }) => {
    const range = futureRange();
    const { id } = await createRequest(request, await login(request, USERS.erin), range);
    await openDashboard(page);
    await requestRow(page, range).getByRole('button', { name: 'Approve' }).click();
    const dialog = page.getByRole('dialog', { name: 'Approve request' });

    // Another validator was faster.
    await decide(request, await login(request, USERS.carol), id, 'reject', 'Already handled');
    await dialog.getByRole('button', { name: 'Approve' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(
      'Request is already rejected. The list has been refreshed.',
    );
    await expect(requestRow(page, range)).toHaveCount(0);
  });
});

test.describe('pagination', () => {
  test('pages through more requests than fit on one page, in the URL too', async ({
    page,
    request,
  }) => {
    const erin = await login(request, USERS.erin);
    for (let i = 0; i < 11; i++) await createRequest(request, erin, futureRange());

    await openDashboard(page);
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(page.getByRole('row')).toHaveCount(11); // header + a full page of 10

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();

    await page.reload();
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();

    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
  });

  test('changing a filter goes back to the first page', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/page=2/);

    await page.getByLabel('Status').selectOption('All');

    await expect(page).not.toHaveURL(/page=/);
  });

  test('the requester sees the same pagination on their own list', async ({ page, request }) => {
    await signIn(page, await login(request, USERS.erin));
    await page.goto('/my-requests');

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
  });
});
