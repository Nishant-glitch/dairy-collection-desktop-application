import { auth, database } from '../firebase/config';
import { ref, get, set, remove } from 'firebase/database';
import { ADMIN_EMAIL } from './userDb';

export interface Subscription {
  plan: string;
  status: 'active' | 'expired' | 'none';
  startedAt: number;
  expiresAt: number;
  note?: string;
  updatedBy?: string;
}

export const subRef = (uid: string) => ref(database, `subscriptions/${uid}`);

// Apni pricing/duration yahan set karo
export const PLANS = {
  monthly:   { label: '1 Month',  days: 30,  price: 199 },
  quarterly: { label: '3 Months', days: 92,  price: 499 },
  yearly:    { label: '1 Year',   days: 365, price: 1499 },
} as const;

export type PlanKey = keyof typeof PLANS;

export const isSubActive = (sub: Subscription | null): boolean =>
  !!sub && sub.status === 'active' && sub.expiresAt > Date.now();

export const daysLeft = (sub: Subscription | null): number =>
  sub ? Math.max(0, Math.ceil((sub.expiresAt - Date.now()) / 86400000)) : 0;

export const getMySubscription = async (): Promise<Subscription | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await get(subRef(user.uid));
  return snap.exists() ? (snap.val() as Subscription) : null;
};

export const hasAccess = async (): Promise<boolean> => {
  if (auth.currentUser?.email === ADMIN_EMAIL) return true; // admin ko hamesha access
  return isSubActive(await getMySubscription());
};

/* -------- Offline-resilient access check --------
 *
 * Firebase RTDB `get()` NEVER resolves offline, so the previous online-only
 * `hasAccess()` would hang the splash screen forever. To keep the app usable
 * for offline milk collection we cache the last verified verdict in
 * localStorage and treat it as authoritative if the live check times out.
 *
 *   • fresh  (< 24 h old)  -> use silently
 *   • grace  (< 7 days)    -> use, but the caller shows a banner
 *   • stale  (> 7 days)    -> block; force reconnect
 *   • absent               -> user has never verified online with this device;
 *                             they need internet at least once (see App.tsx)
 *
 * Cache is namespaced per-uid so switching accounts doesn't leak grants.
 */

const GRACE_DAYS = 7;
const cacheKey = (uid: string) => `dcs_sub_cache_${uid}`;

interface CachedVerdict {
  hasAccess: boolean;
  subExpiresAt: number | null; // subscription's own expiry (not the cache TTL)
  cachedAt: number;            // when we last verified online (ms)
}

const readCache = (uid: string): CachedVerdict | null => {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const writeCache = (uid: string, v: CachedVerdict): void => {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(v)); } catch { /* full/blocked */ }
};

export const clearAccessCache = (uid: string): void => {
  try { localStorage.removeItem(cacheKey(uid)); } catch { /* ignore */ }
};

export type AccessDecision =
  | { kind: 'live';         hasAccess: boolean }
  | { kind: 'cache-fresh';  hasAccess: boolean }
  | { kind: 'cache-grace';  hasAccess: boolean; daysLeft: number }
  | { kind: 'cache-expired' } // grace exhausted
  | { kind: 'no-cache' };     // never verified online on this device

// Races the live subscription check against a timeout. On timeout OR live
// error, falls back to the cached verdict. Never rejects. Always updates the
// cache when the live check does eventually resolve — even after we already
// returned a cache result, so the NEXT app open is fresh.
export const hasAccessWithOfflineFallback = async (timeoutMs = 2000): Promise<AccessDecision> => {
  const user = auth.currentUser;
  if (!user) return { kind: 'no-cache' };
  const uid = user.uid;

  // Fire the live check; it updates the cache as a side effect and never throws.
  const liveP: Promise<boolean | 'error'> = (async () => {
    try {
      if (user.email === ADMIN_EMAIL) {
        writeCache(uid, { hasAccess: true, subExpiresAt: null, cachedAt: Date.now() });
        return true;
      }
      const sub = await getMySubscription();
      const ok = isSubActive(sub);
      writeCache(uid, { hasAccess: ok, subExpiresAt: sub?.expiresAt || null, cachedAt: Date.now() });
      return ok;
    } catch { return 'error'; }
  })();

  const result = await Promise.race<boolean | 'error' | 'timeout'>([
    liveP,
    new Promise((r) => setTimeout(() => r('timeout'), timeoutMs)),
  ]);

  if (result === true || result === false) {
    return { kind: 'live', hasAccess: result };
  }

  // Live timed out or errored -> read the cache.
  const cached = readCache(uid);
  if (!cached) return { kind: 'no-cache' };
  const ageDays = (Date.now() - cached.cachedAt) / 86400000;
  if (ageDays < 1) return { kind: 'cache-fresh', hasAccess: cached.hasAccess };
  if (ageDays < GRACE_DAYS) {
    return { kind: 'cache-grace', hasAccess: cached.hasAccess, daysLeft: Math.max(1, Math.ceil(GRACE_DAYS - ageDays)) };
  }
  return { kind: 'cache-expired' };
};

/* ---- Sirf ADMIN ke liye (rules bhi yahi enforce karti hain) ---- */

export const activateSubscription = async (uid: string, plan: PlanKey, note = '') => {
  const days = PLANS[plan].days;
  const existing = (await get(subRef(uid))).val() as Subscription | null;
  const base = existing && existing.expiresAt > Date.now() ? existing.expiresAt : Date.now();
  const sub: Subscription = {
    plan: String(plan),
    status: 'active',
    startedAt: existing?.startedAt || Date.now(),
    expiresAt: base + days * 86400000,
    note,
    updatedBy: auth.currentUser?.email || 'admin',
  };
  await set(subRef(uid), sub);
  return sub;
};

export const revokeSubscription = async (uid: string) => {
  await remove(subRef(uid));
};
