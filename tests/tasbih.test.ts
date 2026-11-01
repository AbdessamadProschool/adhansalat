/**
 * Tasbih state tests.
 *
 * They exercise the real store against an in-memory storage: no DOM, no
 * timers. What is asserted is the contract the screen relies on — immediate
 * persistence, bounded undo, goal arithmetic, multi-step sessions and honest
 * handling of corrupt or stale data.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILTIN_DHIKR,
  BUILTIN_SESSIONS,
  TASBIH_STORAGE_KEY,
  TasbihStore,
  type StorageLike,
} from '../src/app/tasbih.js';

class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

let storage: MemoryStorage;
let store: TasbihStore;

beforeEach(() => {
  storage = new MemoryStorage();
  store = new TasbihStore(storage);
});

describe('tasbih defaults', () => {
  it('starts on the first preset with a 33 goal', () => {
    expect(store.get().dhikrId).toBe(BUILTIN_DHIKR[0]!.id);
    expect(store.countOf()).toBe(0);
    expect(store.goalOf()).toBe(33);
    expect(store.get().history).toEqual([]);
  });

  it('ships only verified references', () => {
    const references = BUILTIN_DHIKR.map((entry) => entry.reference);
    expect(references).toEqual([
      'Sahih Muslim 597a',
      'Sahih Muslim 597a',
      'Sahih Muslim 597a',
      'Sahih Muslim 2691',
      'Q 71:10',
      'Q 18:39',
      'Q 33:56',
    ]);
    expect(BUILTIN_DHIKR.every((entry) => entry.arabic.length > 0 && entry.translit.length > 0)).toBe(true);
  });

  it('has no ranking, streak or score field', () => {
    const keys = Object.keys(store.get());
    expect(keys).not.toContain('score');
    expect(keys).not.toContain('streak');
    expect(keys).not.toContain('ranking');
  });
});

describe('counting', () => {
  it('writes every increment to storage immediately', () => {
    store.increment();
    store.increment();
    expect(storage.writes).toBe(2);
    const reloaded = new TasbihStore(storage);
    expect(reloaded.countOf()).toBe(2);
    expect(reloaded.get().dhikrId).toBe(store.get().dhikrId);
  });

  it('reports the goal only once it is reached', () => {
    store.setGoal(store.get().dhikrId, 3);
    expect(store.increment()).toMatchObject({ count: 1, reached: false });
    expect(store.increment()).toMatchObject({ count: 2, reached: false });
    expect(store.increment()).toMatchObject({ count: 3, reached: true });
    expect(store.increment()).toMatchObject({ count: 4, reached: true });
  });

  it('keeps counts separate per dhikr', () => {
    store.increment();
    store.selectDhikr('istighfar');
    store.increment();
    store.increment();
    expect(store.countOf('subhanallah')).toBe(1);
    expect(store.countOf('istighfar')).toBe(2);
  });

  it('undoes the last increment and pops the stack', () => {
    store.increment();
    store.increment();
    expect(store.canUndo()).toBe(true);
    expect(store.undoLast()).toBe(true);
    expect(store.countOf()).toBe(1);
    expect(store.undoLast()).toBe(true);
    expect(store.countOf()).toBe(0);
    expect(store.undoLast()).toBe(false);
  });

  it('resets only the selected dhikr and stays undoable', () => {
    store.increment();
    store.selectDhikr('istighfar');
    store.increment();
    store.reset('istighfar');
    expect(store.countOf('istighfar')).toBe(0);
    expect(store.countOf('subhanallah')).toBe(1);
    store.undoLast();
    expect(store.countOf('istighfar')).toBe(1);
  });

  it('supports free goals', () => {
    store.setGoal(store.get().dhikrId, null);
    expect(store.goalOf()).toBeNull();
    expect(store.increment()).toMatchObject({ count: 1, target: null, reached: false });
  });
});

describe('favourites and custom dhikr', () => {
  it('toggles favourites without duplicating', () => {
    expect(store.toggleFavorite('istighfar')).toBe(true);
    expect(store.isFavorite('istighfar')).toBe(true);
    expect(store.toggleFavorite('istighfar')).toBe(false);
    expect(store.get().favorites).toEqual([]);
  });

  it('adds a custom dhikr and selects it with a free goal', () => {
    const result = store.addCustom({ arabic: '  سبحان الله وبحمده  ', translit: 'Subhan Allah wa bihamdih' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dhikr.arabic).toBe('سبحان الله وبحمده');
    expect(result.dhikr.builtin).toBe(false);
    expect(result.dhikr.reference).toBeUndefined();
    expect(store.get().dhikrId).toBe(result.dhikr.id);
    expect(store.goalOf(result.dhikr.id)).toBeNull();
  });

  it('rejects an empty custom dhikr', () => {
    expect(store.addCustom({ arabic: '   ' })).toEqual({ ok: false, reason: 'empty' });
    expect(store.get().custom).toEqual([]);
  });

  it('removes a custom dhikr and its counts, favourites and sessions', () => {
    const result = store.addCustom({ arabic: 'ذكر تجريبي' });
    if (!result.ok) throw new Error('expected custom dhikr');
    const id = result.dhikr.id;
    store.increment();
    store.toggleFavorite(id);
    const session = store.addSession({ name: 'Test', steps: [{ dhikrId: id, target: 3 }] });
    if (!session.ok) throw new Error('expected session');

    expect(store.removeCustom(id)).toBe(true);
    expect(store.countOf(id)).toBe(0);
    expect(store.isFavorite(id)).toBe(false);
    expect(store.get().sessions).toEqual([]);
    expect(store.get().dhikrId).toBe(BUILTIN_DHIKR[0]!.id);
  });

  it('persists custom dhikr across a reload', () => {
    const result = store.addCustom({ arabic: 'لا إله إلا الله', reference: 'Sahih Muslim 2691' });
    if (!result.ok) throw new Error('expected custom dhikr');
    const reloaded = new TasbihStore(storage);
    const found = reloaded.findDhikr(result.dhikr.id);
    expect(found?.arabic).toBe('لا إله إلا الله');
    expect(found?.reference).toBe('Sahih Muslim 2691');
  });
});

describe('multi-step sessions', () => {
  it('advances automatically at each target and records one history entry', () => {
    const afterPrayer = BUILTIN_SESSIONS[0]!;
    expect(store.startSession(afterPrayer, 'Après la prière')).toBe(true);

    for (let i = 0; i < 33; i += 1) store.sessionIncrement();
    expect(store.get().activeSession?.index).toBe(1);

    for (let i = 0; i < 33; i += 1) store.sessionIncrement();
    expect(store.get().activeSession?.index).toBe(2);

    for (let i = 0; i < 33; i += 1) store.sessionIncrement();
    expect(store.get().activeSession?.index).toBe(3);

    const result = store.sessionIncrement();
    expect(result.sessionDone).toBe(true);
    expect(store.get().activeSession).toBeNull();
    expect(store.get().history).toHaveLength(1);
    expect(store.get().history[0]?.total).toBe(100);
    expect(store.get().history[0]?.steps).toEqual([
      { dhikrId: 'subhanallah', count: 33 },
      { dhikrId: 'alhamdulillah', count: 33 },
      { dhikrId: 'allahuakbar', count: 33 },
      { dhikrId: 'tahlil', count: 1 },
    ]);
  });

  it('undoes a completed session and restores the last step', () => {
    store.startSession(BUILTIN_SESSIONS[1]!, 'Tahlil');
    for (let i = 0; i < 100; i += 1) store.sessionIncrement();
    expect(store.get().history).toHaveLength(1);
    expect(store.undoLast()).toBe(true);
    expect(store.get().history).toHaveLength(0);
    expect(store.get().activeSession?.counts[0]).toBe(99);
  });

  it('resumes an active session after a reload', () => {
    store.startSession(BUILTIN_SESSIONS[1]!, 'Tahlil');
    for (let i = 0; i < 5; i += 1) store.sessionIncrement();
    const reloaded = new TasbihStore(storage);
    expect(reloaded.get().activeSession?.index).toBe(0);
    expect(reloaded.get().activeSession?.counts[0]).toBe(5);
    expect(reloaded.get().activeSession?.name).toBe('Tahlil');
  });

  it('abandons without creating history', () => {
    store.startSession(BUILTIN_SESSIONS[1]!, 'Tahlil');
    store.sessionIncrement();
    store.abandonSession();
    expect(store.get().activeSession).toBeNull();
    expect(store.get().history).toEqual([]);
  });

  it('rejects an empty custom session', () => {
    expect(store.addSession({ name: 'Vide', steps: [] })).toEqual({ ok: false, reason: 'empty' });
    expect(store.addSession({ name: 'Vide', steps: [{ dhikrId: 'inconnu', target: 3 }] })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('creates, starts and persists a custom session', () => {
    const created = store.addSession({
      name: 'Soir',
      steps: [
        { dhikrId: 'istighfar', target: 10 },
        { dhikrId: 'salawat', target: 10 },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.session.builtin).toBe(false);
    expect(store.startSession(created.session, created.session.name)).toBe(true);

    const reloaded = new TasbihStore(storage);
    expect(reloaded.get().sessions[0]?.name).toBe('Soir');
    expect(reloaded.get().activeSession?.steps).toEqual(created.session.steps);
  });
});

describe('robustness', () => {
  it('falls back to defaults on corrupt JSON', () => {
    storage.setItem(TASBIH_STORAGE_KEY, '{not json');
    const reloaded = new TasbihStore(storage);
    expect(reloaded.countOf()).toBe(0);
    expect(reloaded.get().history).toEqual([]);
  });

  it('drops counts and favourites that point at unknown dhikr', () => {
    storage.setItem(
      TASBIH_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        dhikrId: 'disparu',
        counts: { disparu: 9, subhanallah: 2 },
        favorites: ['disparu', 'subhanallah'],
      }),
    );
    const reloaded = new TasbihStore(storage);
    expect(reloaded.get().dhikrId).toBe(BUILTIN_DHIKR[0]!.id);
    expect(reloaded.get().counts).toEqual({ subhanallah: 2 });
    expect(reloaded.get().favorites).toEqual(['subhanallah']);
  });

  it('keeps a session whose dhikr still exists and drops unknown steps', () => {
    storage.setItem(
      TASBIH_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeSession: {
          templateId: 'after-prayer',
          name: 'Test',
          steps: [
            { dhikrId: 'subhanallah', target: 3 },
            { dhikrId: 'disparu', target: 5 },
          ],
          index: 0,
          counts: [1, 0],
          startedAt: 1,
        },
      }),
    );
    const reloaded = new TasbihStore(storage);
    expect(reloaded.get().activeSession?.steps).toEqual([{ dhikrId: 'subhanallah', target: 3 }]);
    expect(reloaded.get().activeSession?.counts).toEqual([1]);
  });

  it('works without storage', () => {
    const memoryOnly = new TasbihStore(null);
    memoryOnly.increment();
    expect(memoryOnly.countOf()).toBe(1);
  });
});
