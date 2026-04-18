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
