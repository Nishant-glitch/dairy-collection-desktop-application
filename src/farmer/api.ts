// getFarmerPassbook wrapper + per-(society, farmer, month) offline cache.
//
// Every fetch tries the network first (callables are POSTs, which the service
// worker never caches). On failure we fall back to the last cached snapshot,
// but the result says WHY (`staleReason`) so the UI can tell the truth:
//   - 'offline': navigator.onLine === false — the phone has no connection.
//   - 'server' : we were online but the call failed (function crashed, timed
//                out, not deployed...). The Firebase SDK reports both a dead
//                network and a server 500 as code "internal", so onLine is the
//                only reliable way to tell them apart.
// A rejected PIN / unknown farmer is never masked by the cache: it comes back
// as `reLogin: true` so the app can send the farmer to the login screen.
// Society lookup uses the public societyCodeIndex/{code} node.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, get } from 'firebase/database';
import app, { database } from '../firebase/config';

const functions = getFunctions(app, 'us-central1');
const getFarmerPassbookFn = httpsCallable(functions, 'getFarmerPassbook');

export interface MilkRow { date: string; shift: string; qty: number; fat: number; snf: number | null; rate: number; amount: number; }
export interface GrossRow { date: string; item: string; category: string; pcs: number; rate: number; amount: number; }
export interface RepaymentRow { date: string; amount: number; mode: string; reference?: string; note?: string; }
export interface Summary {
  milkQty: number; milkAmount: number;
  grossAmount: number; deductionAmount: number;
  bfAmount: number; repaymentAmount: number;
  netPayable: number;
}

export interface PassbookData {
  farmerName: string;
  societyName: string;
  month: string;
  availableMonths: string[];
  milk: MilkRow[];
  gross: GrossRow[];
  deductions: GrossRow[];
  repayments: RepaymentRow[];
  summary: Summary;
}

export type StaleReason = 'offline' | 'server';

export interface PassbookResult {
  data: PassbookData;
  fromCache: boolean;
  cachedAt: number | null;   // null when data is fresh from server
  staleReason?: StaleReason; // set when fromCache
  errorCode?: string;        // Firebase error code of the failed call, for support
}

export interface PassbookError {
  message: string;
  locked?: boolean;    // 3-tries lockout hit
  invalidCode?: boolean;
  reLogin?: boolean;   // saved PIN / farmer code no longer valid — log in again
  offline?: boolean;
  errorCode?: string;
}

export const MSG_OFFLINE = 'Internet nahi hai.';
export const MSG_SERVER = 'Server se data nahi mila — thodi der baad try karein.';
export const MSG_PIN_CHANGED = 'PIN badal gaya hai, dobara login karein.';
export const MSG_CODE_GONE = 'Farmer code nahi mila (society ne badla ho sakta hai) — dobara login karein.';

const isOffline = (): boolean =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const cacheKey = (societyUid: string, farmerCode: string, month: string) =>
  `dcs_farmer_cache_${societyUid}_${farmerCode}_${month || 'auto'}`;

const readCache = (uid: string, code: string, month: string): { data: PassbookData; cachedAt: number } | null => {
  try {
    const raw = localStorage.getItem(cacheKey(uid, code, month));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.data || typeof p?.cachedAt !== 'number') return null;
    return p;
  } catch { return null; }
};

const writeCache = (uid: string, code: string, month: string, data: PassbookData): void => {
  try {
    localStorage.setItem(cacheKey(uid, code, month), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch { /* quota full — non-fatal */ }
};

// Drop every cached month for one farmer — used when the society reset the
// PIN or removed the farmer, so a lost/shared phone stops showing the data.
export const clearFarmerCache = (uid: string, code: string): void => {
  try {
    const prefix = `dcs_farmer_cache_${uid}_${code}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

// Resolve the user-typed / QR-filled Society identifier to a Firebase uid.
//
// Accepts either format so old passbook QRs (which encode the raw uid, not
// the short code) keep working alongside the new /farmer?society=CODE QRs:
//   1. Short code (e.g. "001") -> look up societyCodeIndex/{code}
//   2. Firebase-uid-shaped string (>= 20 alphanumeric) -> use as-is
//
// The Cloud Function still verifies the farmer PIN server-side, so passing
// an unknown uid just fails the passbook lookup with the normal "Code galat"
// error — no security exposure from being permissive here.
export const resolveSocietyUid = async (input: string): Promise<string | null> => {
  const s = String(input || '').trim();
  if (!s) return null;
  // 1. Try short code first.
  try {
    const snap = await get(ref(database, `societyCodeIndex/${s}`));
    if (snap.exists()) {
      const uid = snap.val();
      if (typeof uid === 'string' && uid) return uid;
    }
  } catch (e) {
    console.error('resolveSocietyUid: societyCodeIndex read failed:', e);
  }
  // 2. Fallback: input already looks like a uid (from an old-format
  //    /passbook/{uid} QR scan). Firebase Auth uids are 28 chars alnum but
  //    we accept anything >= 20 chars to future-proof against custom auth.
  if (/^[A-Za-z0-9]{20,}$/.test(s)) return s;
  return null;
};

// Try the server; fall back to cache when the call itself fails. Callers look
// at result.fromCache + result.staleReason to pick the banner.
export const fetchPassbook = async (
  societyUid: string,
  farmerCode: string,
  pin: string,
  month: string,
): Promise<{ ok: true; result: PassbookResult } | { ok: false; error: PassbookError }> => {
  // No connection at all: don't wait for the request to fail.
  if (isOffline()) return fromCacheOrError(societyUid, farmerCode, month, 'offline');
  try {
    const resp = await getFarmerPassbookFn({ societyUid, farmerCode, pin, month });
    const json: any = resp?.data || null;
    if (!json) {
      // Server returned nothing usable — fall through to cache.
      return fromCacheOrError(societyUid, farmerCode, month, 'server', 'empty-response');
    }
    if (!json.success) {
      const msg: string = json.message || 'Verify nahi ho paaya.';
      // `reason` comes from newer function deploys; the regexes keep this
      // working against the older one.
      const reason: string = json.reason
        || (json.locked ? 'locked'
          : /code galat/i.test(msg) ? 'code'
          : /PIN set nahi/i.test(msg) ? 'nopin'
          : /PIN galat/i.test(msg) ? 'pin' : '');
      const reLogin = reason === 'pin' || reason === 'nopin' || reason === 'code';
      return {
        ok: false,
        error: {
          message: reason === 'pin' ? `${MSG_PIN_CHANGED} (${msg})`
            : reason === 'code' ? MSG_CODE_GONE
            : msg,
          locked: !!json.locked,
          invalidCode: reason === 'code',
          reLogin,
        },
      };
    }
    const data: PassbookData = {
      farmerName: json.farmerName || farmerCode,
      societyName: json.societyName || '',
      month: json.month || month,
      availableMonths: Array.isArray(json.availableMonths) ? json.availableMonths : [json.month || month],
      milk: json.milk || [],
      gross: json.gross || [],
      deductions: json.deductions || [],
      repayments: json.repayments || [],
      summary: json.summary || { milkQty: 0, milkAmount: 0, grossAmount: 0, deductionAmount: 0, bfAmount: 0, repaymentAmount: 0, netPayable: 0 },
    };
    writeCache(societyUid, farmerCode, data.month, data);
    return { ok: true, result: { data, fromCache: false, cachedAt: null } };
  } catch (e: any) {
    // The call failed. Offline (connection dropped mid-request) vs a server
    // problem (crash, timeout, not deployed) — see the header comment.
    const code = String(e?.code || 'unknown').replace(/^functions\//, '');
    const reason: StaleReason = isOffline() ? 'offline' : 'server';
    console.warn(`fetchPassbook failed (${reason}, ${code}):`, e);
    return fromCacheOrError(societyUid, farmerCode, month, reason, code);
  }
};

const fromCacheOrError = (
  uid: string, code: string, month: string, reason: StaleReason, errorCode?: string,
): { ok: true; result: PassbookResult } | { ok: false; error: PassbookError } => {
  const cached = readCache(uid, code, month);
  if (cached) {
    return { ok: true, result: { data: cached.data, fromCache: true, cachedAt: cached.cachedAt, staleReason: reason, errorCode } };
  }
  const base = reason === 'offline' ? MSG_OFFLINE : MSG_SERVER;
  return {
    ok: false,
    error: {
      message: reason === 'offline'
        ? `${base} Pehli baar data dekhne ke liye internet chahiye.`
        : `${base}${errorCode ? ` (${errorCode})` : ''}`,
      offline: reason === 'offline',
      errorCode,
    },
  };
};
