// Per-month farmer Balance-Forward storage with legacy-format fallback.
//
// The original data model was a SINGLE slot per farmer:
//     farmerBalances/{code} = { balance, forMonth, updatedAt }
// which meant every Finalize overwrote whatever was there — finalizing the
// currently-viewed month wiped the B/F that same month was reading. See the
// investigation report for the full story.
//
// New model — one entry per (farmer, month):
//     farmerBalances/{code}/{yyyy-MM} = { balance, finalizedAt, finalizedBy }
//
// Reads prefer the per-month path; fall back to the legacy scalar only when
// the new path is absent. Writes ALWAYS use the per-month path so unrelated
// months are never touched. Over time (as users re-finalize OR run the
// Recover Balances tool) every farmer migrates transparently.

export interface MonthlyBalance {
  balance: number;
  finalizedAt?: number;
  finalizedBy?: string;
}

export interface LegacyBalance {
  balance: number;
  forMonth: string;
  updatedAt?: number;
}

// A farmer's node value — could be the legacy scalar record OR a map of
// month -> MonthlyBalance, OR both simultaneously during the migration window.
export type FarmerBalanceNode =
  | LegacyBalance
  | { [month: string]: MonthlyBalance }
  | ({ [month: string]: MonthlyBalance } & Partial<LegacyBalance>)
  | null
  | undefined;

// Extract the balance FOR a specific month from a farmer's balance node.
// Returns 0 when neither format has data for that month.
export function bfForMonth(node: FarmerBalanceNode, month: string): number {
  if (!node || typeof node !== 'object') return 0;
  // 1. New per-month path (preferred)
  const monthly = (node as any)[month];
  if (monthly && typeof monthly === 'object' && typeof monthly.balance === 'number') {
    return monthly.balance;
  }
  // 2. Legacy single-slot fallback — only counts when its stored forMonth
  //    matches the month we're asking about.
  const legacy = node as LegacyBalance;
  if (legacy && legacy.forMonth === month && typeof legacy.balance === 'number') {
    return legacy.balance;
  }
  return 0;
}

// Convenience: does this farmer have ANY finalized-balance record?
export function hasAnyBalance(node: FarmerBalanceNode): boolean {
  if (!node || typeof node !== 'object') return false;
  const legacy = node as LegacyBalance;
  if (typeof legacy.balance === 'number' && legacy.forMonth) return true;
  return Object.keys(node).some(
    (k) => /^\d{4}-\d{2}$/.test(k) && typeof (node as any)[k]?.balance === 'number'
  );
}

// Latest month this farmer has been finalized for, across both formats. Used
// by the FarmerLookup popover to display "last finalized: <month>".
export function latestFinalizedMonth(node: FarmerBalanceNode): string | null {
  if (!node || typeof node !== 'object') return null;
  const perMonthKeys = Object.keys(node)
    .filter((k) => /^\d{4}-\d{2}$/.test(k) && typeof (node as any)[k]?.balance === 'number')
    .sort();
  const legacyMonth =
    typeof (node as LegacyBalance).forMonth === 'string' &&
    typeof (node as LegacyBalance).balance === 'number'
      ? (node as LegacyBalance).forMonth
      : null;
  const candidates = [...perMonthKeys, ...(legacyMonth ? [legacyMonth] : [])];
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1];
}

// "YYYY-MM" of the calendar month immediately before the given month.
export function prevMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// "YYYY-MM" of the calendar month immediately after the given month — used by
// the Finalize button label ("Finalize July -> Sets August B/F").
export function nextMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Human month label, e.g. "August 2026".
export function monthLabel(m: string): string {
  try {
    return new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', {
      month: 'long', year: 'numeric',
    });
  } catch { return m; }
}
