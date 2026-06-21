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

export const getRateFromMap = (
  fat: number, 
  snf: number, 
  config: any
): number => {
  if (!config || !config.rateMap) return 0;

  const toKey = (num: number): string => 
    num.toFixed(1).replace('.', '_');

  const fatValues = (config.fatValues || []).map(Number).sort((a: number, b: number) => a - b);
  const snfValues = (config.snfValues || []).map(Number).sort((a: number, b: number) => a - b);

  if (fatValues.length === 0 || snfValues.length === 0) return 0;

  // Cap FAT at max
  const cappedFat = Math.min(fat, fatValues[fatValues.length - 1]);
  // Cap SNF at max
  const cappedSnf = Math.min(snf, snfValues[snfValues.length - 1]);

  // Use the rate band at or below the measured value (dairy convention: a
  // higher rate only applies once that FAT/SNF level is actually reached).
  // This is deterministic and never rounds UP to a higher-paying band.
  // For exact grid values (the normal case) it returns the same value as before.
  // If the value is below the chart minimum, fall back to the lowest band.
  const flooredFat = [...fatValues].reverse().find((v: number) => v <= cappedFat) ?? fatValues[0];
  const flooredSnf = [...snfValues].reverse().find((v: number) => v <= cappedSnf) ?? snfValues[0];

  // Lookup using underscore keys
  const fatKey = toKey(flooredFat);
  const snfKey = toKey(flooredSnf);

  return config.rateMap[fatKey]?.[snfKey] || 0;
};

export const calcCowRate = (fat: number, snf: number, config: any): number => {
  if (!config) return 0;
  const cappedSnf = Math.min(snf, config.snfTo ?? 8.5);
  const cappedFat = Math.min(fat, config.fatTo ?? 5.9);
  const rate = (cappedFat * config.fatPerKg / 100) + (cappedSnf * config.snfPerKg / 100);
  return Math.round(rate * 100) / 100;
};

export const calcBuffaloRate = (fat: number, snf: number, config: any): number => {
  if (!config) return 0;
  const cappedFat = Math.min(fat, config.fatTo ?? 12.0);
  const cappedSnf = Math.min(snf, config.snfTo ?? 10.0);
  const rate = (cappedFat * config.fatPerKg / 100) + (cappedSnf * config.snfPerKg / 100);
  return Math.round(rate * 100) / 100;
};

export const calcMixedRate = (fat: number, snf: number, cowConfig: any, buffaloConfig: any): number => {
  if (!cowConfig || !buffaloConfig) return 0;
  
  if (fat <= (cowConfig.fatTo ?? 5.9) && snf <= (cowConfig.snfTo ?? 8.5)) {
    return calcCowRate(fat, snf, cowConfig);
  } else {
    return calcBuffaloRate(fat, snf, buffaloConfig);
  }
};

export const getRateForDate = async (
  database: any,
  uid: string,
  animalType: 'cow' | 'buffalo' | 'mix',
  collectionDate: string
): Promise<any> => {
  const { ref, get } = await import('firebase/database');
  const historyRef = ref(database, `users/${uid}/rateConfig/${animalType}/history`);
  const snap = await get(historyRef);
  if (!snap.exists()) return null;

  const configs = Object.values(snap.val()) as any[];
  configs.sort((a: any, b: any) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  
  return configs.find((c: any) => c.effectiveFrom <= collectionDate) || configs[configs.length - 1];
};
