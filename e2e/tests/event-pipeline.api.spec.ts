import { expect, test } from '@playwright/test';

test.describe('event pipeline', () => {
  test('the dev ping makes the round trip to the dev event log (the /events-test page)', async ({
    request,
  }) => {
    const sent = await request.post('/api/test/publish');
    expect(sent.ok()).toBeTruthy();
    const { eventId } = await sent.json();

    await expect
      .poll(
        async () => {
          const received: { eventId?: string }[] = await (
            await request.get('/api/test/events')
          ).json();
          return received.some((r) => r.eventId === eventId);
        },
        { message: 'ping never came back from the queue', timeout: 15_000 },
      )
      .toBe(true);
  });
});
