// getFarmerPassbook wrapper + per-(society, farmer, month) offline cache.
//
// Every fetch tries the network; if it succeeds we cache and return. If the
// network fails (offline, function down, timeout) we fall back to the last
// cached snapshot with its cachedAt timestamp so the UI can show a "last
// updated X ago" badge instead of a scary error. Society lookup uses the
// public societyCodeIndex/{code} node.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, get } from 'firebase/database';
import app, { database } from '../firebase/config';

const functions = getFunctions(app, 'us-central1');
const getFarmerPassbookFn = httpsCallable(functions, 'getFarmerPassbook');

export interface MilkRow { date: string; shift: string; qty: number; fat: number; snf: number | null; rate: number; amount: number; }
export interface GrossRow { date: string; item: string; category: string; pcs: number; rate: number; amount: number; }
export interface Summary { milkQty: number; milkAmount: number; grossAmount: number; deductionAmount: number; bfAmount: number; netPayable: number; }

export interface PassbookData {
  farmerName: string;
  societyName: string;
  month: string;
  availableMonths: string[];
  milk: MilkRow[];
  gross: GrossRow[];
  deductions: GrossRow[];
  summary: Summary;
}

export interface PassbookResult {
  data: PassbookData;
  fromCache: boolean;
  cachedAt: number | null;   // null when data is fresh from server
}

export interface PassbookError {
  message: string;
  locked?: boolean;    // 3-tries lockout hit
  invalidCode?: boolean;
}

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

// Try the server; fall back to cache on any network failure so the app still
// opens offline. Callers can look at result.fromCache to decide whether to
// show the "offline / last updated X ago" badge.
export const fetchPassbook = async (
  societyUid: string,
  farmerCode: string,
  pin: string,
  month: string,
): Promise<{ ok: true; result: PassbookResult } | { ok: false; error: PassbookError }> => {
  try {
    const resp = await getFarmerPassbookFn({ societyUid, farmerCode, pin, month });
    const json: any = resp?.data || null;
    if (!json) {
      // Server returned nothing usable — fall through to cache.
      return fromCacheOrError(societyUid, farmerCode, month, 'Server se jawab nahi mila.');
    }
    if (!json.success) {
      return {
        ok: false,
        error: {
          message: json.message || 'Verify nahi ho paaya.',
          locked: !!json.locked,
          invalidCode: /code galat/i.test(json.message || ''),
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
      summary: json.summary || { milkQty: 0, milkAmount: 0, grossAmount: 0, deductionAmount: 0, bfAmount: 0, netPayable: 0 },
    };
    writeCache(societyUid, farmerCode, data.month, data);
    return { ok: true, result: { data, fromCache: false, cachedAt: null } };
  } catch (e) {
    // Network / callable failure — offline, DNS, Cloud Function timeout, etc.
    console.warn('fetchPassbook failed; falling back to cache:', e);
    return fromCacheOrError(societyUid, farmerCode, month, 'Internet nahi hai.');
  }
};

const fromCacheOrError = (
  uid: string, code: string, month: string, fallbackMsg: string,
): { ok: true; result: PassbookResult } | { ok: false; error: PassbookError } => {
  const cached = readCache(uid, code, month);
  if (cached) {
    return { ok: true, result: { data: cached.data, fromCache: true, cachedAt: cached.cachedAt } };
  }
  return { ok: false, error: { message: `${fallbackMsg} Aur cache mein bhi kuch nahi hai. Ek baar internet ke saath kholein.` } };
};
