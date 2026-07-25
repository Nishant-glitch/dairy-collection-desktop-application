// Helper to flatten the nested milkCollection tree into a flat list of entries.
// Used by the Dashboard "Top Farmers" leaderboard.

export interface FlatEntry {
  date: string;
  shift: string;
  farmerCode: string;
  farmerName: string;
  fat: number;
  snf: number | null; // null when the entry was recorded in CLR mode
  qty: number;
  rate: number;
  amount: number;
}

// Flatten milkCollection/{date}/{shift}/{farmerCode} into a flat list.
export const flattenMilkCollection = (mc: any): FlatEntry[] => {
  const out: FlatEntry[] = [];
  if (!mc || typeof mc !== 'object') return out;
  Object.keys(mc).forEach((date) => {
    const shifts = mc[date] || {};
    Object.keys(shifts).forEach((shift) => {
      const rows = shifts[shift] || {};
      Object.keys(rows).forEach((code) => {
        const e = rows[code] || {};
        out.push({
          date,
          shift,
          farmerCode: code,
          farmerName: e.farmerName || code,
          fat: Number(e.fat) || 0,
          snf: e.snf != null ? Number(e.snf) : null,
          qty: Number(e.qty) || 0,
          rate: Number(e.rate) || 0,
          amount: Number(e.amount) || 0,
        });
      });
    });
  });
  return out;
};
