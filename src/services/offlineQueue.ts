// Durable offline queue for milk-collection entries, backed by IndexedDB.
//
// Why not rely on Firebase RTDB's own offline cache? The RTDB web SDK only
// keeps queued writes in MEMORY — if the browser/app is closed while offline,
// those entries are lost forever. In weak-internet villages the clerk may take
// dozens of entries offline and close the app before the network returns, so
// we MUST persist to disk. IndexedDB survives reloads, crashes and restarts.
//
// Zero external dependencies (raw IndexedDB, no `idb`/`localforage`) — the repo
// commits node_modules, so every added package causes huge churn. This wrapper
// is tiny and does exactly what we need.

const DB_NAME = 'dcs-offline';
const DB_VERSION = 1;
const STORE = 'pending-entries';

// Fired on `window` whenever the queue changes (add/remove). The Navbar badge
// and the sync service listen for this to refresh the pending count live.
export const QUEUE_CHANGED = 'dcs-queue-changed';

export interface QueuedEntry {
  localId: string;          // unique id for this queued write (keyPath)
  uid: string;              // owner uid — write goes to users/{uid}/...
  date: string;             // collection date (yyyy-MM-dd)
  shift: 'Morning' | 'Evening';
  farmerCode: string;       // farmer code (RTDB key under the shift)
  data: any;                // the entry payload written to RTDB
  queuedAt: number;         // when it was queued (ms)
  syncStatus: 'pending';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'localId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Run a transaction and resolve with the result of `fn` once it commits.
function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let request: IDBRequest | void;
        try {
          request = fn(store);
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve((request && (request as IDBRequest).result) as T);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

function genId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function notifyChanged() {
  try {
    window.dispatchEvent(new Event(QUEUE_CHANGED));
  } catch {
    /* non-browser env */
  }
}

// Queue an entry for later sync. Returns the stored record (with its localId)
// so the caller can show it optimistically in Recent Entries.
export async function addToQueue(
  entry: Omit<QueuedEntry, 'localId' | 'queuedAt' | 'syncStatus'>
): Promise<QueuedEntry> {
  const record: QueuedEntry = {
    ...entry,
    localId: genId(),
    queuedAt: Date.now(),
    syncStatus: 'pending',
  };
  await tx('readwrite', (store) => store.put(record));
  notifyChanged();
  return record;
}

// All pending entries, oldest first (so sync replays them in order).
export async function getQueue(): Promise<QueuedEntry[]> {
  const all = await tx<QueuedEntry[]>('readonly', (store) => store.getAll());
  return (all || []).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function removeFromQueue(localId: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(localId));
  notifyChanged();
}

export async function getQueueCount(): Promise<number> {
  const n = await tx<number>('readonly', (store) => store.count());
  return n || 0;
}
