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

  it('keeps only the 50 most recent events', () => {
    const store = new ReceivedEventsStore();
    for (let i = 1; i <= 60; i++) store.add(event(i));
    const list = store.list();
    expect(list).toHaveLength(50);
    expect(list[0].receivedAt).toBe('t60');
    expect(list[49].receivedAt).toBe('t11');
  });
});
