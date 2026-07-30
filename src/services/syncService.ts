// Auto-sync for the durable offline queue (see offlineQueue.ts).
//
// Reads every pending entry from IndexedDB and writes it to Firebase RTDB at
// the SAME path MilkCollection uses. On success the entry is removed from the
// queue; on failure it stays for the next attempt. Triggers:
//   • browser `online` event (navigator back online)
//   • RTDB `.info/connected` flips to true (the real socket, most reliable)
//   • the queue changes (a new offline entry was just added)
//   • a 30s background interval (belt-and-braces safety net)
//
// Duplicate protection: a module-level `syncing` flag ensures only one pass
// runs at a time, so the same localId is never written twice concurrently.

import { ref, set, onValue } from 'firebase/database';
import { database } from '../firebase/config';
import { getQueue, removeFromQueue, getQueueCount, QUEUE_CHANGED } from './offlineQueue';

// Emitted on `window` so UI (Navbar) can reflect live progress.
export const SYNC_STATUS = 'dcs-sync-status'; // detail: { pendingCount, syncing }
export const SYNCED = 'dcs-synced';           // detail: { count } -> "N entries synced"

let syncing = false;
let started = false;
let rtdbConnected = false;

async function emitStatus() {
  try {
    const pendingCount = await getQueueCount();
    window.dispatchEvent(new CustomEvent(SYNC_STATUS, { detail: { pendingCount, syncing } }));
  } catch {
    /* ignore */
  }
}

// Write one entry with a timeout guard. RTDB `set()` never resolves while the
// socket is down, so we race it against a timeout to avoid hanging the pass.
function writeWithTimeout(path: string, data: any, ms = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('sync write timed out'));
    }, ms);
    set(ref(database, path), data)
      .then(() => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      })
      .catch((e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      });
  });
}

// Push all pending entries to Firebase. Safe to call repeatedly.
export async function syncPendingEntries(): Promise<void> {
  // Only sync when the RTDB socket is actually up — otherwise every write would
  // hang until the timeout and just churn. Also guard against re-entrancy.
  if (syncing || !rtdbConnected) return;

  const queue = await getQueue();
  if (queue.length === 0) return;

  syncing = true;
  await emitStatus();
  let syncedCount = 0;

  try {
    for (const item of queue) {
      // Recheck the socket between writes; bail early if we dropped offline.
      if (!rtdbConnected) break;
      const path = `users/${item.uid}/milkCollection/${item.date}/${item.shift}/${item.farmerCode}`;
      try {
        await writeWithTimeout(path, item.data);
        await removeFromQueue(item.localId); // last-write-wins overwrite; safe to remove
        syncedCount++;
        await emitStatus();
      } catch (e) {
        // Leave this entry queued; a later pass retries it. Stop the pass —
        // if one write failed (network flaked) the rest likely will too.
        console.error('Sync failed for entry, will retry:', item.localId, e);
        break;
      }
    }
  } finally {
    syncing = false;
    await emitStatus();
  }

  if (syncedCount > 0) {
    try {
      window.dispatchEvent(new CustomEvent(SYNCED, { detail: { count: syncedCount } }));
    } catch {
      /* ignore */
    }
  }
}

// Wire up all sync triggers exactly once (call from App on mount).
export function initSyncService(): void {
  if (started) return;
  started = true;

  // Real RTDB connection state — the most reliable "we can write now" signal.
  onValue(ref(database, '.info/connected'), (snap) => {
    const wasConnected = rtdbConnected;
    rtdbConnected = snap.val() === true;
    if (rtdbConnected && !wasConnected) {
      // Just reconnected — flush the queue.
      syncPendingEntries();
    }
    emitStatus();
  });

  // Browser back online (belt-and-braces; .info/connected usually fires too).
  window.addEventListener('online', () => {
    syncPendingEntries();
  });

  // A new offline entry was just queued — try to flush immediately in case
  // we're actually online (e.g. very brief blip already recovered).
  window.addEventListener(QUEUE_CHANGED, () => {
    emitStatus();
    syncPendingEntries();
  });

  // Background safety net: retry every 30s regardless of events.
  setInterval(() => {
    syncPendingEntries();
  }, 30000);

  // Initial emit so the Navbar shows the pending count immediately on load.
  emitStatus();
}
