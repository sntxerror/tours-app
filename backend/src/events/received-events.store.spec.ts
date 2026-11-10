import { ReceivedEventsStore } from './received-events.store';

const event = (n: number) => ({ receivedAt: `t${n}`, commonEventVersion: '1', envelope: { n } });

describe('ReceivedEventsStore', () => {
  it('starts empty', () => {
    expect(new ReceivedEventsStore().list()).toEqual([]);
  });

  it('lists the newest event first', () => {
    const store = new ReceivedEventsStore();
    store.add(event(1));
    store.add(event(2));
    expect(store.list().map((e) => e.receivedAt)).toEqual(['t2', 't1']);
  });

  it('keeps only the 200 most recent events', () => {
    const store = new ReceivedEventsStore();
    for (let i = 1; i <= 210; i++) store.add(event(i));
    const list = store.list();
    expect(list).toHaveLength(200);
    expect(list[0].receivedAt).toBe('t210');
    expect(list[199].receivedAt).toBe('t11');
  });

  it('lists an event redelivered with the same eventId once, but never dedupes events without one', () => {
    const store = new ReceivedEventsStore();
    store.add({ ...event(1), eventId: 'e-1' });
    store.add({ ...event(2), eventId: 'e-1' });
    store.add({ ...event(3), eventId: 'e-2' });
    store.add(event(4));
    store.add(event(4));

    expect(store.list().map((e) => e.receivedAt)).toEqual(['t4', 't4', 't3', 't1']);
  });
});
