/* eslint-disable no-console -- these tests exercise console.log muting */
import { describeEvent, withQuietConsoleLog } from './event-log';

describe('describeEvent', () => {
  it('summarises an event on one line without its payload', () => {
    const line = describeEvent({
      type: 'travel.vacation-request.approved',
      eventId: '3f2a9c1e-aaaa-bbbb-cccc-000000000000',
      correlationId: '7b1d0e44-aaaa-bbbb-cccc-000000000000',
      actor: {
        type: 'user',
        id: '00000000-1111-2222-3333-444444444444',
        role: 'Validator' as never,
      },
      data: { comment: 'secret reason' },
    } as never);

    expect(line).toBe(
      'travel.vacation-request.approved id=3f2a9c1e correlation=7b1d0e44 actor=user:00000000(Validator)',
    );
    expect(line).not.toContain('secret');
    expect(line).not.toContain('\n');
  });

  it('names non-user actors and tolerates envelopes without the newer fields', () => {
    expect(describeEvent({ type: 't', eventId: 'abcdefghij', actor: { type: 'system' } })).toBe(
      't id=abcdefgh correlation=- actor=system',
    );
    expect(describeEvent({})).toBe('unknown-event id=- correlation=- actor=-');
  });
});

describe('withQuietConsoleLog', () => {
  it('mutes console.log only while the work runs and returns its result', () => {
    const original = console.log;
    const spy = jest.fn();
    console.log = spy;
    try {
      const result = withQuietConsoleLog(() => {
        console.log('library noise');
        return 42;
      });
      expect(result).toBe(42);
      expect(spy).not.toHaveBeenCalled();
      console.log('after');
      expect(spy).toHaveBeenCalledWith('after');
    } finally {
      console.log = original;
    }
  });

  it('restores console.log when the work throws', () => {
    const before = console.log;
    expect(() =>
      withQuietConsoleLog(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(console.log).toBe(before);
  });

  it('leaves console.warn and console.error untouched', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    withQuietConsoleLog(() => console.warn('still visible'));
    expect(warn).toHaveBeenCalledWith('still visible');
    warn.mockRestore();
  });
});
