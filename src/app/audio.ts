/**
 * Audio playback for the Adhan.
 *
 * Rules enforced here, because they are the ones that actually break in the
 * field:
 *  - at most ONE player instance, so two sounds can never overlap;
 *  - the file is verified to exist and to decode before we claim success;
 *  - `stop()` releases the element and revokes the object URL;
 *  - a missing or unreadable file surfaces a real error instead of silence.
 *
 * Imported files are stored as Blobs in IndexedDB (not base64 in localStorage:
 * an Adhan recording does not fit and would block the main thread).
 */

import { SOUND_URL } from './store.js';

const IDB_NAME = 'azan-audio';
const IDB_STORE = 'files';

interface StoredFile {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

export async function putAudioFile(id: string, file: File): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({
      id,
      name: file.name,
      mime: file.type,
      blob: file,
      createdAt: Date.now(),
    } satisfies StoredFile);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('write failed'));
  });
  db.close();
}

export async function getAudioFile(id: string): Promise<StoredFile | undefined> {
  const db = await openDb();
  const result = await new Promise<StoredFile | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredFile | undefined);
    req.onerror = () => reject(req.error ?? new Error('read failed'));
  });
  db.close();
  return result;
}

export async function deleteAudioFile(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('delete failed'));
  });
  db.close();
}

export async function listAudioFiles(): Promise<StoredFile[]> {
  const db = await openDb();
  const out = await new Promise<StoredFile[]>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve((req.result as StoredFile[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('list failed'));
  });
  db.close();
  return out;
}

export class AudioError extends Error {}

/**
 * Checks that a bundled asset is reachable without downloading it twice.
 *
 * A `HEAD` request is the cheap path, but it is not universally supported: the
 * Android asset loader and several static hosts answer 405. The fallback asks
 * for a single byte with `Range` and cancels the body, which proves the file
 * exists without buffering a multi-megabyte Adhan.
 */
async function assetExists(url: string): Promise<boolean> {
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (head?.ok) return true;

  const ranged = await fetch(url, { headers: { Range: 'bytes=0-0' } }).catch(() => null);
  if (!ranged) return false;
  const exists = ranged.ok || ranged.status === 206;
  try {
    await ranged.body?.cancel();
  } catch {
    /* body already consumed or unavailable: the status is what matters */
  }
  return exists;
}

export class AdhanPlayer {
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private playingId: string | null = null;
  private listeners = new Set<() => void>();

  get currentId(): string | null {
    return this.playingId;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** Resolves the playable URL for a sound id, or throws a descriptive error. */
  private async resolveUrl(soundId: string): Promise<string> {
    if (soundId === 'none') throw new AudioError('sound is set to "none"');
    const builtin = SOUND_URL[soundId];
    if (builtin) {
      // Verify the asset really exists before claiming it plays.
      if (!(await assetExists(builtin))) {
        throw new AudioError(`missing audio asset: ${builtin}`);
      }
      return builtin;
    }
    const file = await getAudioFile(soundId);
    if (!file) throw new AudioError(`imported sound not found: ${soundId}`);
    this.revokeUrl();
    this.objectUrl = URL.createObjectURL(file.blob);
    return this.objectUrl;
  }

  private revokeUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  stop(): void {
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.load();
      this.element = null;
    }
    this.revokeUrl();
    if (this.playingId !== null) {
      this.playingId = null;
      this.notify();
    }
  }

  /**
   * Plays a sound. The promise rejects with a concrete reason (missing file,
   * unsupported format, autoplay blocked) so the UI can tell the truth.
   */
  async play(soundId: string): Promise<void> {
    this.stop();
    const url = await this.resolveUrl(soundId);

    const audio = new Audio();
    audio.src = url;
    audio.preload = 'auto';
    audio.volume = 1;
    this.element = audio;
    this.playingId = soundId;
    this.notify();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.stop();
        reject(new AudioError(message));
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const cleanup = () => {
        audio.removeEventListener('error', onError);
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('playing', ok);
      };
      const onError = () => fail(`cannot decode or load ${soundId}`);
      const onEnded = () => {
        this.stop();
      };
      audio.addEventListener('error', onError);
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('playing', ok);

      // A decode failure can also surface without an error event on some
      // browsers, so guard with a timeout.
      const timer = setTimeout(() => {
        if (!settled && audio.readyState === 0) fail('audio did not start within 5s');
      }, 5000);

      audio
        .play()
        .then(() => {
          clearTimeout(timer);
          // `playing` is the authoritative signal, but play() resolving is enough
          // on browsers that do not fire it for very short files.
          if (audio.readyState >= 2) ok();
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          const name = err instanceof Error ? err.name : 'Error';
          fail(
            name === 'NotAllowedError'
              ? 'autoplay blocked: a user gesture is required'
              : `playback rejected (${name})`,
          );
        });
    });
  }
}

export const adhanPlayer = new AdhanPlayer();
