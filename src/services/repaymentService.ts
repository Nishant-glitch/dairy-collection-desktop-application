// Farmer repayments — when a farmer pays back dues (clears a negative B/F)
// in cash / bank / UPI. Entries are stored under users/{uid}/farmerRepayments
// and auto-mirrored into the Cash Book receipt side so the clerk doesn't
// have to double-enter.
//
// Direction (confirmed): a repayment ADDS to that month's Net Payable in
// the Payment Register — the farmer's old debt shrinks, so the amount
// society now owes grows. See the walkthrough in the task approval:
//   netPayable = milkGross − deductions + bfAmount + repayments

import { ref, get, set, push, remove } from 'firebase/database';
import { database, auth } from '../firebase/config';
import { up } from '../utils/userDb';

export const REPAYMENT_MODES = ['cash', 'bank', 'upi', 'other'] as const;
export type RepaymentMode = typeof REPAYMENT_MODES[number];

export interface Repayment {
  repaymentId?: string;    // Firebase push key — present on reads, absent on new()
  date: string;            // yyyy-MM-dd
  farmerId: string;
  farmerName?: string;     // snapshot for easier reporting
  amount: number;          // always positive
  mode: RepaymentMode;
  reference?: string;      // bank/UPI txn id, cheque no.
  note?: string;
  createdAt: number;
  createdBy: string;
}

export const modeLabel = (m: string): string =>
  ({ cash: 'Cash', bank: 'Bank', upi: 'UPI', other: 'Other' } as Record<string, string>)[m] || m;

// Create a repayment AND auto-mirror into Cash Book. Returns the new id.
// Cash vs Bank column follows mode (upi -> bank side, matches society practice).
// Cash Book failure is non-fatal: the repayment itself is already saved and
// the clerk sees a warning; they can retry the cashbook sync manually later.
export async function addRepayment(
  r: Omit<Repayment, 'repaymentId' | 'createdAt' | 'createdBy'>,
): Promise<string> {
  const createdAt = Date.now();
  const createdBy = auth.currentUser?.email || auth.currentUser?.uid || 'unknown';
  const amount = Math.abs(Number(r.amount) || 0);
  if (amount <= 0) throw new Error('Repayment amount must be positive.');

  const refNode = push(ref(database, up('farmerRepayments')));
  const id = refNode.key!;
  await set(refNode, { ...r, amount, createdAt, createdBy });

  // Cash Book receipt-side auto-entry (jamma). Dedup via sourceRef on delete.
  try {
    await push(ref(database, up('cashBook')), {
      date: r.date,
      side: 'receipt',
      ledgerFolio: '',
      accountName: 'दूध उत्पादक',
      particulars:
        `Farmer Repayment — ${r.farmerName || r.farmerId} (${r.farmerId})` +
        (r.reference ? ` [ref: ${r.reference}]` : '') +
        (r.note ? ` — ${r.note}` : ''),
      voucherNo: r.reference || '',
      cashAmount: r.mode === 'cash' ? amount : 0,
      bankAmount: r.mode === 'bank' || r.mode === 'upi' ? amount : 0,
      source: 'repayment',
      sourceRef: id,
      createdAt,
    });
  } catch (e) {
    console.error('Cash Book auto-entry failed (repayment is still saved):', e);
  }
  return id;
}

// Delete a repayment + its linked Cash Book entry (matched by sourceRef).
export async function deleteRepayment(repaymentId: string): Promise<void> {
  await remove(ref(database, up(`farmerRepayments/${repaymentId}`)));
  try {
    const cbSnap = await get(ref(database, up('cashBook')));
    if (!cbSnap.exists()) return;
    const cb = cbSnap.val();
    for (const key of Object.keys(cb)) {
      if (cb[key]?.source === 'repayment' && cb[key]?.sourceRef === repaymentId) {
        await remove(ref(database, up(`cashBook/${key}`)));
        break;
      }
    }
  } catch (e) {
    console.error('Cash Book cleanup failed on repayment delete:', e);
  }
}

// Read all repayments; filter by range (both bounds inclusive) + optional farmer.
export async function listRepayments(
  fromDate = '',
  toDate = '',
  farmerId = '',
): Promise<Repayment[]> {
  const snap = await get(ref(database, up('farmerRepayments')));
  if (!snap.exists()) return [];
  const data = snap.val();
  const out: Repayment[] = [];
  Object.keys(data).forEach((id) => {
    const r = data[id];
    if (!r?.date || !r?.farmerId) return;
    if (fromDate && r.date < fromDate) return;
    if (toDate && r.date > toDate) return;
    if (farmerId && r.farmerId !== farmerId) return;
    out.push({ repaymentId: id, ...r });
  });
  out.sort((a, b) =>
    b.date.localeCompare(a.date) || ((b.createdAt || 0) - (a.createdAt || 0))
  );
  return out;
}

// Sum per-farmer within an in-memory list — used by Payment Register
// after it reads the whole node once.
export function sumRepaymentsByFarmer(repayments: Repayment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of repayments) {
    out[r.farmerId] = (out[r.farmerId] || 0) + (Number(r.amount) || 0);
  }
  return out;
}
