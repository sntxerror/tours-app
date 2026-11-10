import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, USERS } from '../support/api';
import { loginThroughForm } from '../support/ui';

test.describe('login', () => {
  test('a requester lands on their requests and sees the requester navigation', async ({
    page,
  }) => {
    await loginThroughForm(page, USERS.alice);

    await expect(page).toHaveURL('/my-requests');
    await expect(page.getByRole('heading', { name: 'My vacation requests' })).toBeVisible();
    const header = page.getByRole('banner');
    await expect(header.getByText('Alice Martin')).toBeVisible();
    await expect(header.getByText('Requester')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'My requests' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Team calendar' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  });

  test('a validator lands on the dashboard and sees the validator navigation', async ({ page }) => {
    await loginThroughForm(page, USERS.carol);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Vacation requests' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'My requests' })).toHaveCount(0);
  });

  test('a wrong password shows an error and keeps the user on the login page', async ({ page }) => {
    await loginThroughForm(page, USERS.alice, 'not-the-password');

    await expect(page.getByRole('alert')).toContainText('Invalid email or password.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an unknown email gets the same error (no account enumeration)', async ({ page }) => {
    await loginThroughForm(page, 'nobody@example.com', DEMO_PASSWORD);

    await expect(page.getByRole('alert')).toContainText('Invalid email or password.');
  });

  test('the demo account buttons fill the form', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: USERS.carol }).click();

    await expect(page.getByLabel('Email')).toHaveValue(USERS.carol);
    await expect(page.getByLabel('Password')).toHaveValue(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('route guards', () => {
  test('a visitor is sent to the login page and back to the page they asked for', async ({
    page,
  }) => {
    await page.goto('/team');
    await expect(page).toHaveURL(/\/login\?redirect=\/team$/);

    await page.getByLabel('Email').fill(USERS.alice);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/team$/);
    await expect(page.getByRole('heading', { name: 'Team calendar' })).toBeVisible();
  });

  test('a redirect to another site is ignored', async ({ page }) => {
    await page.goto('/login?redirect=//example.org/phish');
    await page.getByLabel('Email').fill(USERS.alice);
    await page.getByLabel('Password').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL('/my-requests');
  });

  test('a requester cannot open the dashboard', async ({ page }) => {
    await loginThroughForm(page, USERS.alice);
    await expect(page).toHaveURL('/my-requests');

    await page.goto('/dashboard');
    await expect(page).toHaveURL('/my-requests');
  });

  test('a validator cannot open the requester page', async ({ page }) => {
    await loginThroughForm(page, USERS.carol);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/my-requests');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('a logged-in user is taken away from the login page, and unknown paths lead home', async ({
    page,
  }) => {
    await loginThroughForm(page, USERS.alice);
    await expect(page).toHaveURL('/my-requests');

    await page.goto('/login');
    await expect(page).toHaveURL('/my-requests');
    await page.goto('/no/such/page');
    await expect(page).toHaveURL('/my-requests');
  });
});

test.describe('session', () => {
  test('survives a page reload', async ({ page }) => {
    await loginThroughForm(page, USERS.alice);
    await expect(page).toHaveURL('/my-requests');

    await page.reload();

    await expect(page).toHaveURL('/my-requests');
    await expect(page.getByRole('banner').getByText('Alice Martin')).toBeVisible();
  });

  test('logging out ends it', async ({ page }) => {
    await loginThroughForm(page, USERS.alice);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/my-requests');
    await expect(page).toHaveURL(/\/login\?redirect=\/my-requests$/);
  });

  test('a stored token that is no longer valid is discarded', async ({ page }) => {
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('vacation-manager.token', 'expired.or.bogus'));

    await page.goto('/my-requests');

    await expect(page).toHaveURL(/\/login\?redirect=\/my-requests$/);
  });
});
