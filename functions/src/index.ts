import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

admin.initializeApp();

// MUST stay identical to the web app's src/utils/passbook.ts hashPin, otherwise
// PINs set in the browser won't verify here.
const PASSBOOK_SALT = 'DCSPro::passbook::v1::salt';
const hashPin = (pin: string): string =>
  crypto.createHash('sha256').update(PASSBOOK_SALT + '|' + String(pin).trim()).digest('hex');

const MAX_ATTEMPTS = 3;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

const sum = (rows: any[], pick: (r: any) => number) => rows.reduce((s, r) => s + pick(r), 0);

// Callable HTTPS function for the no-login farmer passbook. Using onCall (not
// onRequest) means the Firebase SDK resolves the correct URL on the client and
// handles CORS automatically — no manual headers, no URL guessing. It can be
// invoked without authentication (request.auth is simply undefined here).
//
// All access is server-side via the Admin SDK (bypasses security rules), so
// pinHash and milk data are NEVER exposed to the client. The PIN is verified
// here; only the requesting farmer's own aggregated data is returned.
export const getFarmerPassbook = onCall({ region: 'us-central1' }, async (request) => {
  const { societyUid, farmerCode, pin } = (request.data || {}) as {
    societyUid?: string; farmerCode?: string; pin?: string;
  };
  if (!societyUid || !farmerCode || !pin) {
    throw new HttpsError('invalid-argument', 'Missing fields (societyUid, farmerCode, pin).');
  }

  const db = admin.database();
  const attemptRef = db.ref(`passbookAttempts/${societyUid}/${farmerCode}`);
  const now = Date.now();

  // 1. Server-side lockout check.
  const attempt = (await attemptRef.get()).val() || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    const mins = Math.ceil((attempt.lockedUntil - now) / 60000);
    return { success: false, locked: true, message: `Bahut zyada galat koshish. ${mins} minute baad try karein.` };
  }

  // 2. Read the farmer's pinHash + name (private; Admin SDK bypasses rules).
  const pdSnap = await db.ref(`users/${societyUid}/passbookData/${farmerCode}`).get();
  if (!pdSnap.exists() || !pdSnap.val().pinHash) {
    return { success: false, message: 'Code galat hai ya PIN set nahi hai.' };
  }
  const pd = pdSnap.val();

  // 3. Verify PIN server-side.
  if (hashPin(pin) !== pd.pinHash) {
    const count = (attempt.count || 0) + 1;
    if (count >= MAX_ATTEMPTS) {
      await attemptRef.set({ count: 0, lockedUntil: now + LOCK_MS });
      return { success: false, message: `PIN galat. ${MAX_ATTEMPTS} baar galat — 15 minute ke liye lock.` };
    }
    await attemptRef.set({ count, lockedUntil: 0 });
    return { success: false, message: `PIN galat hai. (${MAX_ATTEMPTS - count} koshish baaki)` };
  }

  // Correct PIN — reset the attempt counter.
  await attemptRef.remove();

  // 4. Society name (for the header).
  const dcsSnap = await db.ref(`users/${societyUid}/dcsInfo`).get();
  const societyName = dcsSnap.exists() ? (dcsSnap.val().name || dcsSnap.val().societyName || '') : '';

  // 5. This farmer's own history (private passbookHistory, kept in sync by the app).
  const raw = (await db.ref(`users/${societyUid}/passbookHistory/${farmerCode}`).get()).val() || {};
  const history = Object.keys(raw)
    .map((k) => {
      const e = raw[k] || {};
      return {
        date: e.date || '', shift: e.shift || '',
        qty: Number(e.qty) || 0, fat: Number(e.fat) || 0,
        snf: e.snf != null ? Number(e.snf) : null,
        rate: Number(e.rate) || 0, amount: Number(e.amount) || 0,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.shift.localeCompare(a.shift));

  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0, 7);
  const todayRows = history.filter((h) => h.date === today);
  const monthRows = history.filter((h) => h.date.startsWith(month));

  // 6. Return ONLY this farmer's data.
  return {
    success: true,
    farmerName: pd.name || farmerCode,
    societyName,
    today: { qty: sum(todayRows, (e) => e.qty), amount: sum(todayRows, (e) => e.amount) },
    thisMonth: { qty: sum(monthRows, (e) => e.qty), amount: sum(monthRows, (e) => e.amount) },
    history,
  };
});
