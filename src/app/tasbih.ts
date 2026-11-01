/**
 * Tasbih (dhikr counter): state, persistence and session logic.
 *
 * Design rules enforced here:
 *  - the module never touches the DOM, so it is unit-testable in Node;
 *  - every mutation is written to storage immediately, so a reboot or a killed
 *    tab cannot lose a count;
 *  - one bounded undo stack restores the previous counts *and* the previous
 *    session step, because undoing only the number after an auto-advance would
 *    leave the session out of sync;
 *  - built-in dhikr carry a verifiable reference. Custom dhikr may have none,
 *    and the UI says "no reference" rather than inventing one;
 *  - no score, no streak, no public ranking: history is a local log.
 */

import type { MessageKey } from './i18n.js';

export const TASBIH_STORAGE_KEY = 'azan.tasbih.v1';
const MAX_HISTORY = 100;
const MAX_UNDO = 25;
const MAX_CUSTOM = 60;
const MAX_CUSTOM_SESSIONS = 30;
const MAX_TEXT = 220;
const MAX_REFERENCE = 90;
const MAX_NAME = 60;

export type GoalTarget = number | null;

export interface DhikrPreset {
  id: string;
  arabic: string;
  translit: string;
  translationKey: MessageKey;
  /** Verifiable citation. Never a claim of reward, only a source. */
  reference: string;
  defaultGoal: number;
}

/**
 * Presets and their citations.
 *
 *  597a   Sahih Muslim — the 33/33/33 tasbih after the prayer, completed to one
 *         hundred with the tahlil.
 *  2691   Sahih Muslim — the tahlil "there is no god but Allah, alone…".
 *  Q 71:10, Q 18:39, Q 33:56 — Qur'anic verses containing the formula used.
 *
 * The text itself is the well-known formula; nothing is paraphrased or
 * attributed to a source that does not contain it.
 */
export const BUILTIN_DHIKR: readonly DhikrPreset[] = [
  {
    id: 'subhanallah',
    arabic: 'سبحان الله',
    translit: 'Subhan Allah',
    translationKey: 'tasbih.dhikr.subhanallah',
    reference: 'Sahih Muslim 597a',
    defaultGoal: 33,
  },
  {
    id: 'alhamdulillah',
    arabic: 'الحمد لله',
    translit: 'Al-hamdu lillah',
    translationKey: 'tasbih.dhikr.alhamdulillah',
    reference: 'Sahih Muslim 597a',
    defaultGoal: 33,
  },
  {
    id: 'allahuakbar',
    arabic: 'الله أكبر',
    translit: 'Allahu akbar',
    translationKey: 'tasbih.dhikr.allahuakbar',
    reference: 'Sahih Muslim 597a',
    defaultGoal: 33,
  },
  {
    id: 'tahlil',
    arabic: 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير',
    translit: 'La ilaha illa Allah wahdahu la sharika lah…',
    translationKey: 'tasbih.dhikr.tahlil',
    reference: 'Sahih Muslim 2691',
    defaultGoal: 100,
  },
  {
    id: 'istighfar',
    arabic: 'أستغفر الله',
    translit: 'Astaghfir Allah',
    translationKey: 'tasbih.dhikr.istighfar',
    reference: 'Q 71:10',
    defaultGoal: 100,
  },
  {
    id: 'hawqala',
    arabic: 'لا حول ولا قوة إلا بالله',
    translit: 'La hawla wa la quwwata illa billah',
    translationKey: 'tasbih.dhikr.hawqala',
    reference: 'Q 18:39',
    defaultGoal: 100,
  },
  {
    id: 'salawat',
    arabic: 'اللهم صل وسلم على نبينا محمد وعلى آله',
    translit: 'Allahumma salli wa sallim ‘ala nabiyyina Muhammad',
    translationKey: 'tasbih.dhikr.salawat',
    reference: 'Q 33:56',
    defaultGoal: 100,
  },
];

export interface CustomDhikr {
  id: string;
  arabic: string;
  translit?: string;
  translation?: string;
  reference?: string;
  createdAt: number;
}

/** A dhikr as the UI needs it, built-in or user-created. */
export interface Dhikr {
  id: string;
  arabic: string;
  translit?: string;
  /** Literal translation for custom dhikr. */
  translation?: string;
  /** i18n key for built-in translations. */
  translationKey?: MessageKey;
  reference?: string;
  builtin: boolean;
}

export interface SessionStep {
  dhikrId: string;
  target: number;
}

export interface SessionTemplate {
  id: string;
  name?: string;
  nameKey?: MessageKey;
  builtin: boolean;
  steps: SessionStep[];
}

export const BUILTIN_SESSIONS: readonly SessionTemplate[] = [
  {
    id: 'after-prayer',
    nameKey: 'tasbih.session.afterPrayer',
    builtin: true,
    steps: [
      { dhikrId: 'subhanallah', target: 33 },
      { dhikrId: 'alhamdulillah', target: 33 },
      { dhikrId: 'allahuakbar', target: 33 },
      { dhikrId: 'tahlil', target: 1 },
    ],
  },
  {
    id: 'tahlil-100',
    nameKey: 'tasbih.session.tahlil100',
    builtin: true,
    steps: [{ dhikrId: 'tahlil', target: 100 }],
  },
];

export interface ActiveSession {
  templateId: string;
  name: string;
  steps: SessionStep[];
  index: number;
  /** Reached count for each step, parallel to `steps`. */
  counts: number[];
  startedAt: number;
}

export interface HistoryStep {
  dhikrId: string;
  count: number;
}

export interface HistoryEntry {
  id: string;
  name: string;
  finishedAt: number;
  total: number;
  steps: HistoryStep[];
}

interface UndoSnapshot {
  counts: Record<string, number>;
  activeSession: ActiveSession | null;
  historyLength: number;
}

export interface TasbihState {
  version: 1;
  dhikrId: string;
  counts: Record<string, number>;
  goals: Record<string, GoalTarget>;
  vibration: boolean;
  favorites: string[];
  custom: CustomDhikr[];
  sessions: SessionTemplate[];
  history: HistoryEntry[];
  activeSession: ActiveSession | null;
  undo: UndoSnapshot[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IncrementResult {
  count: number;
  target: GoalTarget;
  reached: boolean;
}

export interface SessionIncrementResult {
  /** false when there is no active session. */
  active: boolean;
  count: number;
  target: number;
  stepDone: boolean;
  sessionDone: boolean;
  total: number;
}

function newId(prefix: string): string {
  const cryptoRef = globalThis.crypto as Crypto | undefined;
  if (cryptoRef?.randomUUID) return `${prefix}_${cryptoRef.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function defaultGoalFor(id: string): GoalTarget {
  const preset = BUILTIN_DHIKR.find((entry) => entry.id === id);
  return preset ? preset.defaultGoal : null;
}

function presetIds(): Set<string> {
  return new Set(BUILTIN_DHIKR.map((entry) => entry.id));
}

export function emptyState(): TasbihState {
  const goals: Record<string, GoalTarget> = {};
  for (const preset of BUILTIN_DHIKR) goals[preset.id] = preset.defaultGoal;
  return {
    version: 1,
    dhikrId: BUILTIN_DHIKR[0]!.id,
    counts: {},
    goals,
    vibration: true,
    favorites: [],
    custom: [],
    sessions: [],
    history: [],
    activeSession: null,
    undo: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCounts(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[key] = Math.min(Math.floor(value), 1_000_000);
    }
  }
  return out;
}

function readGoals(raw: unknown): Record<string, GoalTarget> {
  const out: Record<string, GoalTarget> = {};
  if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (value === null) out[key] = null;
      else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        out[key] = Math.min(Math.floor(value), 100_000);
      }
    }
  }
  for (const preset of BUILTIN_DHIKR) {
    if (!(preset.id in out)) out[preset.id] = preset.defaultGoal;
  }
  return out;
}

function readCustom(raw: unknown): CustomDhikr[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomDhikr[] = [];
  for (const value of raw) {
    if (!isRecord(value)) continue;
    const arabic = cleanText(value.arabic);
    if (!arabic) continue;
    const entry: CustomDhikr = {
      id: typeof value.id === 'string' && value.id.startsWith('custom_') ? value.id : newId('custom'),
      arabic,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    };
    const translit = cleanText(value.translit, 120);
    if (translit) entry.translit = translit;
    const translation = cleanText(value.translation, 200);
    if (translation) entry.translation = translation;
    const reference = cleanText(value.reference, MAX_REFERENCE);
    if (reference) entry.reference = reference;
    out.push(entry);
    if (out.length >= MAX_CUSTOM) break;
  }
  return out;
}

function readSteps(raw: unknown, known: Set<string>): SessionStep[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionStep[] = [];
  for (const value of raw) {
    if (!isRecord(value)) continue;
    const dhikrId = typeof value.dhikrId === 'string' ? value.dhikrId : '';
    const target = typeof value.target === 'number' ? Math.floor(value.target) : 0;
    if (!dhikrId || !known.has(dhikrId) || target < 1) continue;
    out.push({ dhikrId, target: Math.min(target, 100_000) });
  }
  return out.slice(0, 20);
}

function readSessions(raw: unknown, known: Set<string>): SessionTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionTemplate[] = [];
  for (const value of raw) {
    if (!isRecord(value)) continue;
    const steps = readSteps(value.steps, known);
    if (steps.length === 0) continue;
    const name = cleanText(value.name, MAX_NAME);
    out.push({
      id: typeof value.id === 'string' && value.id.startsWith('session_') ? value.id : newId('session'),
      ...(name ? { name } : {}),
      builtin: false,
      steps,
    });
    if (out.length >= MAX_CUSTOM_SESSIONS) break;
  }
  return out;
}

function readHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryEntry[] = [];
  for (const value of raw) {
    if (!isRecord(value)) continue;
    const name = cleanText(value.name, MAX_NAME) || 'Tasbih';
    const steps: HistoryStep[] = [];
    if (Array.isArray(value.steps)) {
      for (const step of value.steps) {
        if (!isRecord(step)) continue;
        const dhikrId = typeof step.dhikrId === 'string' ? step.dhikrId : '';
        const count = typeof step.count === 'number' ? Math.floor(step.count) : 0;
        if (!dhikrId || count < 1) continue;
        steps.push({ dhikrId, count });
      }
    }
    if (steps.length === 0) continue;
    const total = steps.reduce((sum, step) => sum + step.count, 0);
    out.push({
      id: typeof value.id === 'string' && value.id.startsWith('hist_') ? value.id : newId('hist'),
      name,
      finishedAt: typeof value.finishedAt === 'number' ? value.finishedAt : Date.now(),
      total,
      steps,
    });
    if (out.length >= MAX_HISTORY) break;
  }
  return out;
}

function readActiveSession(
  raw: unknown,
  known: Set<string>,
  sessions: readonly SessionTemplate[],
): ActiveSession | null {
  if (!isRecord(raw)) return null;
  const steps = readSteps(raw.steps, known);
  if (steps.length === 0) return null;
  const index = typeof raw.index === 'number' ? Math.floor(raw.index) : 0;
  if (index < 0 || index >= steps.length) return null;
  const counts = steps.map((step, i) => {
    const value = Array.isArray(raw.counts) ? raw.counts[i] : 0;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
    return Math.min(Math.floor(value), step.target);
  });
  const templateId = typeof raw.templateId === 'string' ? raw.templateId : '';
  const template = sessions.find((entry) => entry.id === templateId);
  const name = cleanText(raw.name, MAX_NAME) || template?.name || '';
  return {
    templateId,
    name,
    steps,
    index,
    counts,
    startedAt: typeof raw.startedAt === 'number' ? raw.startedAt : Date.now(),
  };
}

export function normaliseState(raw: unknown): TasbihState {
  const base = emptyState();
  if (!isRecord(raw)) return base;
  const custom = readCustom(raw.custom);
  const known = new Set([...presetIds(), ...custom.map((entry) => entry.id)]);
  const sessions = readSessions(raw.sessions, known);
  const counts = readCounts(raw.counts);
  for (const id of Object.keys(counts)) {
    if (!known.has(id)) delete counts[id];
  }
  const feasibleDhikr = typeof raw.dhikrId === 'string' && known.has(raw.dhikrId)
    ? raw.dhikrId
    : base.dhikrId;
  const goals = readGoals(raw.goals);
  for (const id of Object.keys(goals)) {
    if (!known.has(id)) delete goals[id];
  }
  const favorites = Array.isArray(raw.favorites)
    ? [...new Set(raw.favorites.filter((id): id is string => typeof id === 'string' && known.has(id)))]
    : [];
  return {
    version: 1,
    dhikrId: feasibleDhikr,
    counts,
    goals,
    vibration: typeof raw.vibration === 'boolean' ? raw.vibration : true,
    favorites,
    custom,
    sessions,
    history: readHistory(raw.history),
    activeSession: readActiveSession(raw.activeSession, known, sessions),
    undo: [],
  };
}

function cloneCounts(counts: Record<string, number>): Record<string, number> {
  return { ...counts };
}

function cloneSession(session: ActiveSession | null): ActiveSession | null {
  if (!session) return null;
  return { ...session, steps: session.steps.map((step) => ({ ...step })), counts: [...session.counts] };
}

export class TasbihStore {
  private state: TasbihState;
  private readonly storage: StorageLike | null;
  private readonly listeners = new Set<() => void>();

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.storage = storage;
    this.state = this.read();
  }

  private read(): TasbihState {
    if (!this.storage) return emptyState();
    try {
      const raw = this.storage.getItem(TASBIH_STORAGE_KEY);
      if (!raw) return emptyState();
      return normaliseState(JSON.parse(raw));
    } catch {
      return emptyState();
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(TASBIH_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full or blocked: the in-memory session keeps working */
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private commit(): void {
    this.persist();
    this.emit();
  }

  private pushUndo(): void {
    this.state.undo.push({
      counts: cloneCounts(this.state.counts),
      activeSession: cloneSession(this.state.activeSession),
      historyLength: this.state.history.length,
    });
    if (this.state.undo.length > MAX_UNDO) this.state.undo.shift();
  }

  get(): Readonly<TasbihState> {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** All dhikr available right now, built-in first. */
  dhikrList(): Dhikr[] {
    const builtin = BUILTIN_DHIKR.map(
      (preset): Dhikr => ({
        id: preset.id,
        arabic: preset.arabic,
        translit: preset.translit,
        translationKey: preset.translationKey,
        reference: preset.reference,
        builtin: true,
      }),
    );
    const custom = this.state.custom.map(
      (entry): Dhikr => ({
        id: entry.id,
        arabic: entry.arabic,
        translit: entry.translit,
        translation: entry.translation,
        reference: entry.reference,
        builtin: false,
      }),
    );
    return [...builtin, ...custom];
  }

  findDhikr(id: string): Dhikr | undefined {
    return this.dhikrList().find((entry) => entry.id === id);
  }

  /** Built-in presets plus user-created templates. */
  sessionTemplates(): SessionTemplate[] {
    return [...BUILTIN_SESSIONS, ...this.state.sessions];
  }

  countOf(id = this.state.dhikrId): number {
    return this.state.counts[id] ?? 0;
  }

  goalOf(id = this.state.dhikrId): GoalTarget {
    return this.state.goals[id] === undefined ? defaultGoalFor(id) : this.state.goals[id]!;
  }

  selectDhikr(id: string): void {
    if (!this.findDhikr(id)) return;
    this.state.dhikrId = id;
    this.commit();
  }

  increment(): IncrementResult {
    this.pushUndo();
    const id = this.state.dhikrId;
    const count = (this.state.counts[id] ?? 0) + 1;
    this.state.counts[id] = count;
    const target = this.goalOf(id);
    this.commit();
    return { count, target, reached: target !== null && count >= target };
  }

  /** Restores the counts and the session step captured before the last action. */
  undoLast(): boolean {
    const snapshot = this.state.undo.pop();
    if (!snapshot) return false;
    this.state.counts = snapshot.counts;
    this.state.activeSession = snapshot.activeSession;
    this.state.history = this.state.history.slice(0, snapshot.historyLength);
    this.commit();
    return true;
  }

  canUndo(): boolean {
    return this.state.undo.length > 0;
  }

  reset(id = this.state.dhikrId): void {
    if (!this.findDhikr(id)) return;
    this.pushUndo();
    delete this.state.counts[id];
    this.commit();
  }

  setGoal(id: string, target: GoalTarget): void {
    if (!this.findDhikr(id)) return;
    if (target !== null && (!Number.isFinite(target) || target < 1)) return;
    this.state.goals[id] = target === null ? null : Math.min(Math.floor(target), 100_000);
    this.commit();
  }

  toggleFavorite(id: string): boolean {
    if (!this.findDhikr(id)) return false;
    const at = this.state.favorites.indexOf(id);
    if (at >= 0) this.state.favorites.splice(at, 1);
    else this.state.favorites.push(id);
    this.commit();
    return at < 0;
  }

  isFavorite(id: string): boolean {
    return this.state.favorites.includes(id);
  }

  setVibration(enabled: boolean): void {
    this.state.vibration = enabled;
    this.commit();
  }

  addCustom(input: {
    arabic: string;
    translit?: string;
    translation?: string;
    reference?: string;
  }): { ok: true; dhikr: Dhikr } | { ok: false; reason: 'empty' | 'limit' } {
    const arabic = cleanText(input.arabic);
    if (!arabic) return { ok: false, reason: 'empty' };
    if (this.state.custom.length >= MAX_CUSTOM) return { ok: false, reason: 'limit' };
    const entry: CustomDhikr = { id: newId('custom'), arabic, createdAt: Date.now() };
    const translit = cleanText(input.translit, 120);
    if (translit) entry.translit = translit;
    const translation = cleanText(input.translation, 200);
    if (translation) entry.translation = translation;
    const reference = cleanText(input.reference, MAX_REFERENCE);
    if (reference) entry.reference = reference;
    this.state.custom.push(entry);
    this.state.goals[entry.id] = null;
    this.state.dhikrId = entry.id;
    this.commit();
    return { ok: true, dhikr: this.findDhikr(entry.id)! };
  }

  removeCustom(id: string): boolean {
    const at = this.state.custom.findIndex((entry) => entry.id === id);
    if (at < 0) return false;
    // No undo snapshot here on purpose: `undo` restores counts and sessions, not
    // the custom list, so pushing one would make the next "undo" look unrelated.
    // Deletion is already behind an explicit confirmation.
    this.state.custom.splice(at, 1);
    delete this.state.counts[id];
    delete this.state.goals[id];
    this.state.favorites = this.state.favorites.filter((entry) => entry !== id);
    this.state.sessions = this.state.sessions.filter(
      (session) => !session.steps.some((step) => step.dhikrId === id),
    );
    if (this.state.activeSession?.steps.some((step) => step.dhikrId === id)) {
      this.state.activeSession = null;
    }
    if (this.state.dhikrId === id) this.state.dhikrId = BUILTIN_DHIKR[0]!.id;
    this.commit();
    return true;
  }

  addSession(input: {
    name: string;
    steps: Array<{ dhikrId: string; target: number }>;
  }): { ok: true; session: SessionTemplate } | { ok: false; reason: 'empty' | 'limit' } {
    const name = cleanText(input.name, MAX_NAME);
    const steps = readSteps(input.steps, new Set(this.dhikrList().map((entry) => entry.id)));
    if (steps.length === 0) return { ok: false, reason: 'empty' };
    if (this.state.sessions.length >= MAX_CUSTOM_SESSIONS) return { ok: false, reason: 'limit' };
    const session: SessionTemplate = {
      id: newId('session'),
      ...(name ? { name } : {}),
      builtin: false,
      steps,
    };
    this.state.sessions.push(session);
    this.commit();
    return { ok: true, session };
  }

  removeSession(id: string): boolean {
    const at = this.state.sessions.findIndex((session) => session.id === id);
    if (at < 0) return false;
    this.state.sessions.splice(at, 1);
    if (this.state.activeSession?.templateId === id) this.state.activeSession = null;
    this.commit();
    return true;
  }

  startSession(template: SessionTemplate, label?: string): boolean {
    const known = new Set(this.dhikrList().map((entry) => entry.id));
    const steps = template.steps.filter((step) => known.has(step.dhikrId) && step.target > 0);
    if (steps.length === 0) return false;
    this.state.activeSession = {
      templateId: template.id,
      name: cleanText(label ?? template.name, MAX_NAME),
      steps: steps.map((step) => ({ ...step })),
      index: 0,
      counts: steps.map(() => 0),
      startedAt: Date.now(),
    };
    this.commit();
    return true;
  }

  sessionLabel(session: ActiveSession, translate: (key: MessageKey) => string): string {
    if (session.name) return session.name;
    const template = this.sessionTemplates().find((entry) => entry.id === session.templateId);
    if (template?.name) return template.name;
    if (template?.nameKey) return translate(template.nameKey);
    return translate('tasbih.session.customName');
  }

  sessionIncrement(): SessionIncrementResult {
    const session = this.state.activeSession;
    if (!session) {
      return {
        active: false,
        count: 0,
        target: 0,
        stepDone: false,
        sessionDone: false,
        total: 0,
      };
    }
    this.pushUndo();
    const step = session.steps[session.index]!;
    const current = Math.min((session.counts[session.index] ?? 0) + 1, step.target);
    session.counts[session.index] = current;
    const stepDone = current >= step.target;
    let sessionDone = false;

    if (stepDone) {
      if (session.index >= session.steps.length - 1) {
        const steps: HistoryStep[] = session.steps.map((entry, index) => ({
          dhikrId: entry.dhikrId,
          count: session.counts[index] ?? 0,
        }));
        const total = steps.reduce((sum, entry) => sum + entry.count, 0);
        this.state.history.unshift({
          id: newId('hist'),
          name: session.name || 'Tasbih',
          finishedAt: Date.now(),
          total,
          steps,
        });
        this.state.history = this.state.history.slice(0, MAX_HISTORY);
        this.state.activeSession = null;
        sessionDone = true;
      } else {
        session.index += 1;
      }
    }

    this.commit();
    return {
      active: this.state.activeSession !== null,
      count: current,
      target: step.target,
      stepDone,
      sessionDone,
      total: this.sessionTotal(),
    };
  }

  /** Moves to the next step without waiting for the target (explicit skip). */
  skipSessionStep(): void {
    const session = this.state.activeSession;
    if (!session) return;
    this.pushUndo();
    if (session.index >= session.steps.length - 1) {
      this.state.activeSession = null;
    } else {
      session.index += 1;
    }
    this.commit();
  }

  abandonSession(): void {
    if (!this.state.activeSession) return;
    this.state.activeSession = null;
    this.state.undo = [];
    this.commit();
  }

  sessionTotal(): number {
    const session = this.state.activeSession;
    if (!session) return 0;
    return session.counts.reduce((sum, count) => sum + count, 0);
  }

  clearHistory(): void {
    this.state.history = [];
    this.commit();
  }

  /** Total dhikr counted, derived from history. Never used as a ranking. */
  historyTotal(): number {
    return this.state.history.reduce((sum, entry) => sum + entry.total, 0);
  }
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** Single instance used by the screen. */
export const tasbihStore = new TasbihStore();
