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

// grossEntries is a single node (Cattle Feed / Medicine / Advance / Store /
// Other). We split it for display: cash-style deductions vs goods ("gross" /
// saman). Both are still deducted from the milk payment (matches Payment
// Register, which sums ALL grossEntries as deductions). Adjust this list if the
// society treats other categories as pure deductions.
const DEDUCTION_CATEGORIES = ['Advance'];
const isDeductionCategory = (cat: string) =>
  DEDUCTION_CATEGORIES.some((c) => c.toLowerCase() === String(cat || '').trim().toLowerCase());

// Same as PaymentRegister.prevMonthOf — the month immediately before m.
const prevMonthOf = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Callable HTTPS function for the no-login farmer passbook. onCall lets the
// Firebase SDK resolve the URL + handle CORS automatically; it can be invoked
// without authentication (request.auth is simply undefined).
//
// Returns the farmer's full account for a selected month: milk collection,
// gross/deduction entries, and a summary that matches Payment Register exactly
// (netPayable = milkAmount − deductions + bfAmount). All reads are server-side
// via the Admin SDK, so nothing sensitive is exposed to the client.
export const getFarmerPassbook = onCall({ region: 'us-central1' }, async (request) => {
  try {
    const { societyUid, farmerCode, pin, month } = (request.data || {}) as {
      societyUid?: string; farmerCode?: string; pin?: string; month?: string;
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

    // 2. Read the farmer record (node key IS the code — no query needed).
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
    await attemptRef.remove(); // correct PIN — reset counter

    // 5. Load everything for this farmer (Admin SDK bypasses rules).
    const [dcsSnap, mcSnap, geSnap, balSnap] = await Promise.all([
      db.ref(`users/${societyUid}/dcsInfo`).get(),
      db.ref(`users/${societyUid}/milkCollection`).get(),
      db.ref(`users/${societyUid}/grossEntries/${farmerCode}`).get(),
      db.ref(`users/${societyUid}/farmerBalances/${farmerCode}`).get(),
    ]);

    const dcs = dcsSnap.val() || {};
    const societyName = dcs.name || dcs.societyName || '';

    // Milk collection — walk milkCollection/{date}/{shift}/{code}, keep this farmer.
    const allMilk: any[] = [];
    const mc = mcSnap.val() || {};
    Object.keys(mc).forEach((date) => {
      const shifts = mc[date] || {};
      Object.keys(shifts).forEach((shift) => {
        const e = (shifts[shift] || {})[farmerCode];
        if (e) {
          allMilk.push({
            date, shift,
            qty: Number(e.qty) || 0, fat: Number(e.fat) || 0,
            snf: e.snf != null ? Number(e.snf) : (e.clr != null ? Number(e.clr) : null),
            rate: Number(e.rate) || 0, amount: Number(e.amount) || 0,
          });
        }
      });
    });

    // Gross / deduction entries — grossEntries/{code}/{entryId}.
    const allGross: any[] = [];
    const ge = geSnap.val() || {};
    Object.keys(ge).forEach((id) => {
      const e = ge[id];
      if (!e || typeof e !== 'object') return;
      allGross.push({
        date: e.date || '', item: e.item || e.itemName || '', category: e.category || '',
        pcs: Number(e.pcs) || Number(e.qty) || 0, rate: Number(e.rate) || 0, amount: Number(e.amount) || 0,
      });
    });

    // Available months = union of milk + gross months (newest first).
    const monthsSet = new Set<string>();
    allMilk.forEach((m) => m.date && monthsSet.add(m.date.substring(0, 7)));
    allGross.forEach((g) => g.date && monthsSet.add(g.date.substring(0, 7)));
    const availableMonths = Array.from(monthsSet).sort().reverse();

    const currentMonth = new Date().toISOString().substring(0, 7);
    const selectedMonth =
      month && /^\d{4}-\d{2}$/.test(month) ? month
        : (availableMonths.includes(currentMonth) ? currentMonth : (availableMonths[0] || currentMonth));

    const milk = allMilk
      .filter((m) => m.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));
    const monthGross = allGross
      .filter((g) => g.date.startsWith(selectedMonth))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Split into goods ("gross" / saman) vs cash deductions (Advance, ...).
    const gross = monthGross.filter((g) => !isDeductionCategory(g.category));
    const deductions = monthGross.filter((g) => isDeductionCategory(g.category));

    // Balance Forward — same rule as PaymentRegister: only if the stored
    // balance is exactly for the previous month.
    const bfMonth = prevMonthOf(selectedMonth);
    const bal = balSnap.val();
    const bfAmount = (bal && bal.forMonth === bfMonth && typeof bal.balance === 'number') ? bal.balance : 0;

    const milkQty = sum(milk, (e) => e.qty);
    const milkAmount = sum(milk, (e) => e.amount);
    const grossAmount = sum(gross, (e) => e.amount);
    const deductionAmount = sum(deductions, (e) => e.amount);
    // Both goods + cash reduce the payment (all grossEntries), matching Payment
    // Register (netPayable = milkAmount − allGrossEntries + bfAmount).
    const netPayable = milkAmount - grossAmount - deductionAmount + bfAmount;

    logger.info('getFarmerPassbook ok', {
      societyUid, farmerCode, selectedMonth,
      allMilk: allMilk.length, allGross: allGross.length,
      milkInMonth: milk.length, grossInMonth: gross.length, deductionsInMonth: deductions.length,
      availableMonths,
    });

    return {
      success: true,
      farmerName: farmer.farmerName || farmerCode,
      societyName,
      month: selectedMonth,
      availableMonths: availableMonths.length ? availableMonths : [selectedMonth],
      milk,        // date, shift, qty, fat, snf, rate, amount
      gross,       // goods/saman: date, item, category, pcs, rate, amount
      deductions,  // cash deductions (Advance): date, item, category, pcs, rate, amount
      summary: { milkQty, milkAmount, grossAmount, deductionAmount, bfAmount, netPayable },
    };
  } catch (err: any) {
    logger.error('getFarmerPassbook failed', err);
    throw new HttpsError('internal', 'Passbook load nahi ho paaya. Baad mein try karein.');
  }
});
