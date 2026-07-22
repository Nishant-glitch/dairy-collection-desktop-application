import { onRequest } from 'firebase-functions/v2/https';
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

// Public HTTPS endpoint for the no-login farmer passbook. All access is
// server-side via the Admin SDK (bypasses security rules), so pinHash and milk
// data are NEVER exposed to the client. The PIN is verified here; only the
// requesting farmer's own aggregated data is returned.
export const getFarmerPassbook = onRequest({ cors: true }, async (req, res) => {
  // Defensive CORS (cors:true already handles it, but keep explicit for clarity).
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const { societyUid, farmerCode, pin } = req.body || {};
  if (!societyUid || !farmerCode || !pin) {
    res.status(400).json({ success: false, message: 'Missing fields' });
    return;
  }

  const db = admin.database();
  const attemptRef = db.ref(`passbookAttempts/${societyUid}/${farmerCode}`);
  const now = Date.now();

  // 1. Server-side lockout check.
  const attempt = (await attemptRef.get()).val() || { count: 0, lockedUntil: 0 };
  if (attempt.lockedUntil && now < attempt.lockedUntil) {
    const mins = Math.ceil((attempt.lockedUntil - now) / 60000);
    res.json({ success: false, locked: true, message: `Bahut zyada galat koshish. ${mins} minute baad try karein.` });
    return;
  }

  // 2. Read the farmer's pinHash + name (private; Admin SDK bypasses rules).
  const pdSnap = await db.ref(`users/${societyUid}/passbookData/${farmerCode}`).get();
  if (!pdSnap.exists() || !pdSnap.val().pinHash) {
    res.json({ success: false, message: 'Code galat hai ya PIN set nahi hai.' });
    return;
  }
  const pd = pdSnap.val();

  // 3. Verify PIN server-side.
  if (hashPin(pin) !== pd.pinHash) {
    const count = (attempt.count || 0) + 1;
    if (count >= MAX_ATTEMPTS) {
      await attemptRef.set({ count: 0, lockedUntil: now + LOCK_MS });
      res.json({ success: false, message: `PIN galat. ${MAX_ATTEMPTS} baar galat — 15 minute ke liye lock.` });
    } else {
      await attemptRef.set({ count, lockedUntil: 0 });
      res.json({ success: false, message: `PIN galat hai. (${MAX_ATTEMPTS - count} koshish baaki)` });
    }
    return;
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
  res.json({
    success: true,
    farmerName: pd.name || farmerCode,
    societyName,
    today: { qty: sum(todayRows, (e) => e.qty), amount: sum(todayRows, (e) => e.amount) },
    thisMonth: { qty: sum(monthRows, (e) => e.qty), amount: sum(monthRows, (e) => e.amount) },
    history,
  });
});
