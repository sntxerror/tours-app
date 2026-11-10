import {
  ALL_EVENT_TYPES,
  AuthEvent,
  EVENT_ROUTE_PREFIX,
  type EventPayloads,
  type EventType,
  VacationEvent,
} from './event-types';

describe('event types', () => {
  it('lists every type exactly once', () => {
    expect(new Set(ALL_EVENT_TYPES).size).toBe(ALL_EVENT_TYPES.length);
  });

  it('namespaces every type under travel.', () => {
    for (const type of ALL_EVENT_TYPES) expect(type).toMatch(/^travel\.[a-z-]+\.[a-z-]+$/);
  });

  it('contains every vacation and auth event and nothing else', () => {
    const expected = [...Object.values(VacationEvent), ...Object.values(AuthEvent)];
    expect([...ALL_EVENT_TYPES].sort()).toEqual([...expected].sort());
  });

  it('routes types under /events/', () => {
    expect(EVENT_ROUTE_PREFIX).toBe('/events/');
  });

  it('can index the payload map with any listed type', () => {
    // Compile-time check (tsc): each listed type is a key of EventPayloads.
    const keyOf = (type: (typeof ALL_EVENT_TYPES)[number]): keyof EventPayloads => type;
    const payload: EventPayloads[EventType] = {
      requestId: 'r-1',
      userId: 'u-1',
      startDate: '2030-01-01',
      endDate: '2030-01-02',
      status: 'Pending' as never,
    };
    expect(ALL_EVENT_TYPES.map(keyOf)).toEqual(ALL_EVENT_TYPES);
    expect(payload).toBeDefined();
  });
});
