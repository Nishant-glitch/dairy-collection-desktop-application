import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

// Explicit databaseURL so admin.database() always resolves, even if the
// FIREBASE_CONFIG env var doesn't carry it.
admin.initializeApp({
  databaseURL: 'https://farmerdb-ba9b0-default-rtdb.firebaseio.com',
});

// MUST stay identical to the web app's src/utils/passbook.ts hashPin, otherwise
// PINs set in the browser won't verify here.
const PASSBOOK_SALT = 'DCSPro::passbook::v1::salt';
const hashPin = (pin: string): string =>
  crypto.createHash('sha256').update(PASSBOOK_SALT + '|' + String(pin).trim()).digest('hex');

const MAX_ATTEMPTS = 3;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

const sum = (rows: any[], pick: (r: any) => number) => rows.reduce((s, r) => s + pick(r), 0);

// Callable HTTPS function for the no-login farmer passbook. onCall lets the
// Firebase SDK resolve the URL + handle CORS automatically. It can be invoked
// without authentication (request.auth is simply undefined).
//
// All access is server-side via the Admin SDK (bypasses security rules), so
// pinHash and milk data are NEVER exposed to the client. Only the requesting
// farmer's own aggregated data is returned. Field naming matches the DB:
// farmers are keyed by their code (users/{uid}/farmers/{code}), the name is
// `farmerName`, and the PIN hash is `pinHash` on that same record.
export const getFarmerPassbook = onCall({ region: 'us-central1' }, async (request) => {
  try {
    const { societyUid, farmerCode, pin } = (request.data || {}) as {
      societyUid?: string; farmerCode?: string; pin?: string;
    };
    if (!societyUid || !farmerCode || !pin) {
      return { success: false, message: 'Zaroori jaankari missing hai.' };
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

    // 2. Read the farmer record (private; Admin SDK bypasses rules). The node
    //    key IS the farmer code, so a direct ref is correct (no query needed).
    const farmerSnap = await db.ref(`users/${societyUid}/farmers/${farmerCode}`).get();
    if (!farmerSnap.exists()) {
      return { success: false, message: 'Code galat hai.' };
    }
    const farmer = farmerSnap.val() || {};

    // 3. Null-safety: no PIN set -> clean message, never a crash.
    if (!farmer.pinHash) {
      return { success: false, message: 'Is farmer ka PIN set nahi hai. Society se sampark karein.' };
    }

    // 4. Verify PIN server-side.
    if (hashPin(pin) !== farmer.pinHash) {
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

    // 5. Society name (for the header).
    const dcsSnap = await db.ref(`users/${societyUid}/dcsInfo`).get();
    const dcs = dcsSnap.val() || {};
    const societyName = dcs.name || dcs.societyName || '';

    // 6. This farmer's own history (denormalized passbookHistory, kept in sync).
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

    // 7. Return ONLY this farmer's data.
    return {
      success: true,
      farmerName: farmer.farmerName || farmerCode,
      societyName,
      today: { qty: sum(todayRows, (e) => e.qty), amount: sum(todayRows, (e) => e.amount) },
      thisMonth: { qty: sum(monthRows, (e) => e.qty), amount: sum(monthRows, (e) => e.amount) },
      history,
    };
  } catch (err: any) {
    // Any unexpected failure -> logged + a clean HttpsError (not bare "internal").
    logger.error('getFarmerPassbook failed', err);
    throw new HttpsError('internal', 'Passbook load nahi ho paaya. Baad mein try karein.');
  }
});
