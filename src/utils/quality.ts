// Milk quality / adulteration detection helpers.
//
// A farmer's FAT/SNF suddenly dropping well below their own recent average can
// indicate water/adulteration. We flag it (never block) so a clerk can re-check.
// Threshold is a single constant so it can be tuned later.

export const QUALITY_DROP_THRESHOLD = 0.20; // 20% below recent average = flag
export const QUALITY_MIN_HISTORY = 7;       // need at least 7 prior entries

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

const mean = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;

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

// Most-recent-first history for one farmer.
export const farmerHistory = (all: FlatEntry[], farmerCode: string): FlatEntry[] =>
  all
    .filter((e) => e.farmerCode === farmerCode)
    .sort((a, b) => b.date.localeCompare(a.date) || b.shift.localeCompare(a.shift));

export interface QualityResult {
  avgFat: number;
  avgSnf: number | null;
  fatDrop: boolean;
  snfDrop: boolean;
}

// Compare the current FAT/SNF against the average of the farmer's most recent
// prior entries. Returns null when history is too short (< QUALITY_MIN_HISTORY)
// or when there is no significant drop.
export const detectQualityDrop = (
  priorEntries: FlatEntry[],
  curFat: number,
  curSnf: number | null
): QualityResult | null => {
  if (priorEntries.length < QUALITY_MIN_HISTORY) return null;

  const last = priorEntries.slice(0, QUALITY_MIN_HISTORY);
  const avgFat = mean(last.map((e) => e.fat));

  const snfVals = last.map((e) => e.snf).filter((v): v is number => v != null && v > 0);
  const avgSnf = snfVals.length ? mean(snfVals) : null;

  const fatDrop = avgFat > 0 && curFat > 0 && curFat < avgFat * (1 - QUALITY_DROP_THRESHOLD);
  const snfDrop =
    avgSnf != null && curSnf != null && curSnf > 0 && curSnf < avgSnf * (1 - QUALITY_DROP_THRESHOLD);

  if (fatDrop || snfDrop) return { avgFat, avgSnf, fatDrop, snfDrop };
  return null;
};
