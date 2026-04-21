import * as XLSX from 'xlsx';

export interface RateChartData {
  fat: number;
  snf: number;
  rate: number;
}

export interface ParseResult {
  data: RateChartData[];
  fatValues: number[];
  snfValues: number[];
  rateMap: Record<number, Record<number, number>>;
}

/**
 * Utility to format number to 2 decimal places as a number
 */
export const formatTo2Decimal = (value: any): number => {
  const num = Number(value);
  if (isNaN(num)) return 0;
  return Number(num.toFixed(2));
};

/**
 * CSV Parser
 */
export const parseCSVData = (csvText: string): any[][] => {
  const lines = csvText.split(/\r?\n/);
  return lines
    .map(line => {
      const row = line.split(',').map(cell => {
        let value = cell.trim().replace(/\u00a0/g, ' ');
        if (value !== "" && !isNaN(Number(value))) {
          return Number(Number(value).toFixed(2));
        }
        return value;
      });
      return row;
    })
    .filter(row => row.some(cell => cell !== ""));
};

/**
 * Raw Excel Parser - Kept as fallback but manual entry is primary
 */
export const getRawExcelData = (fileBuffer: ArrayBuffer): any[][] => {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  if (!rawData || rawData.length === 0) return [];

  return rawData
    .map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return "";
        let value = cell;
        if (typeof value === 'string') {
          value = value.trim().replace(/\u00a0/g, ' ');
          if (value !== "" && !isNaN(Number(value))) {
            return Number(Number(value).toFixed(2));
          }
        } else if (typeof value === 'number') {
          return Number(value.toFixed(2));
        }
        return value;
      })
    )
    .filter(row => row.some(cell => cell !== ""));
};
