export interface RateChartEntry {
  id?: string;
  fatFrom: number;
  fatTo: number;
  snfFrom: number;
  snfTo: number;
  rate: number;
}

export const calculateRate = (
  fat: number,
  snf: number,
  rateChart: RateChartEntry[]
): number => {
  // Find matching rate from rate chart
  const matchingEntry = rateChart.find(
    (entry) =>
      fat >= entry.fatFrom &&
      fat <= entry.fatTo &&
      snf >= entry.snfFrom &&
      snf <= entry.snfTo
  );

  return matchingEntry ? matchingEntry.rate : 0;
};

export const calculateFormulaRate = (
  fat: number,
  snf: number,
  formula: any
): number => {
  if (!formula) return 0;

  let fatAmount = 0;
  if (formula.fatTierEnabled) {
    fatAmount = fat <= formula.fatTierUpto
      ? fat * formula.fatRateBelow
      : fat * formula.fatRateAbove;
  } else {
    fatAmount = fat * formula.fatRate;
  }

  let snfAmount = 0;
  if (formula.snfTierEnabled) {
    snfAmount = snf <= formula.snfTierUpto
      ? snf * formula.snfRateBelow
      : snf * formula.snfRateAbove;
  } else {
    snfAmount = snf * formula.snfRate;
  }

  let adjustment = 0;
  if (formula.adjustmentEnabled && fat >= formula.adjFatFrom && fat <= formula.adjFatTo) {
    adjustment = formula.adjAmount;
  }

  return Math.round((fatAmount + snfAmount + adjustment) * 100) / 100;
};

export const calculateAmount = (rate: number, quantity: number): number => {
  return rate * quantity;
};

export const formatIndianCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export const calcCowRate = (fat: number, snf: number, config: any): number => {
  if (!config) return 0;
  const rate = (fat * config.fatPerKg / 100) + (snf * config.snfPerKg / 100);
  return Math.round(rate * 100) / 100;
};

export const calcBuffaloRate = (fat: number, config: any): number => {
  if (!config) return 0;
  const rate = fat * config.fatPerKg / 100;
  return Math.round(rate * 100) / 100;
};

export const getRateForDate = async (
  database: any,
  uid: string,
  animalType: 'cow' | 'buffalo',
  collectionDate: string
): Promise<any> => {
  const { ref, get } = await import('firebase/database');
  const historyRef = ref(database, `users/${uid}/rateConfig/${animalType}/history`);
  const snap = await get(historyRef);
  if (!snap.exists()) return null;

  const history = snap.val();
  const configs = Object.values(history) as any[];
  
  configs.sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  
  const applicable = configs.find((c: any) => c.effectiveFrom <= collectionDate);
  return applicable || configs[configs.length - 1];
};
