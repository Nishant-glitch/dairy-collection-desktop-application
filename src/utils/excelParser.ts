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
 * Robust Excel Parser for Dairy Rate Charts
 * Handles messy, inconsistent files with automatic header detection and data cleaning.
 */
export const parseDairyExcel = (fileBuffer: ArrayBuffer): ParseResult => {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 1. Read Excel file and convert to JSON with header: 1 (2D array)
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  if (!rawData || rawData.length === 0) {
    throw new Error("Excel file is empty");
  }

  // 2. Automatically clean and normalize data
  const cleanData = rawData
    .map(row => 
      row.map(cell => {
        if (typeof cell === 'string') {
          // Trim and remove hidden characters like \xa0
          let cleaned = cell.trim().replace(/\u00a0/g, ' ');
          // Convert numeric strings to numbers safely
          if (cleaned !== "" && !isNaN(Number(cleaned))) {
            return Number(cleaned);
          }
          return cleaned;
        }
        return cell;
      })
    )
    // Ignore completely empty rows
    .filter(row => row.some(cell => cell !== ""));

  // 3. Automatically detect the correct header row (SNF Header)
  // Logic: Find the first row where most values (except first cell) are valid numbers
  let headerRowIndex = -1;
  for (let i = 0; i < cleanData.length; i++) {
    const row = cleanData[i];
    const numericCells = row.slice(1).filter(cell => typeof cell === 'number' && !isNaN(cell));
    
    // If more than 50% of cells (excluding first) are numbers, and we have at least some numbers
    if (numericCells.length > 0 && numericCells.length >= (row.length - 1) * 0.5) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Invalid Excel format: No valid header row found");
  }

  const snfHeaderRow = cleanData[headerRowIndex];
  const snfValues: number[] = [];
  const validColumnIndices: number[] = [];

  // 4 & 5. Extract SNF values and ignore unwanted content (AVG, TOTAL, non-numeric)
  for (let j = 1; j < snfHeaderRow.length; j++) {
    const val = snfHeaderRow[j];
    if (typeof val === 'number' && !isNaN(val)) {
      snfValues.push(val);
      validColumnIndices.push(j);
    }
  }

  if (snfValues.length === 0) {
    throw new Error("Invalid Excel format: No valid SNF values found in header");
  }

  const resultData: RateChartData[] = [];
  const fatValues: number[] = [];
  const rateMap: Record<number, Record<number, number>> = {};

  // 4 & 5. Extract FAT and Rate data dynamically
  for (let i = headerRowIndex + 1; i < cleanData.length; i++) {
    const row = cleanData[i];
    const fatVal = row[0];

    // Skip rows where FAT is not a valid number
    if (typeof fatVal !== 'number' || isNaN(fatVal)) {
      continue;
    }

    // 6. Handle floating precision issues (Round to 1 decimal for FAT/SNF, 2 for Rate)
    const roundedFat = Math.round(fatVal * 10) / 10;
    fatValues.push(roundedFat);
    rateMap[roundedFat] = {};

    validColumnIndices.forEach((colIdx, snfIdx) => {
      const snf = Math.round(snfValues[snfIdx] * 10) / 10;
      let rate = row[colIdx];

      // Replace invalid values (NaN) safely
      if (typeof rate !== 'number' || isNaN(rate)) {
        rate = 0;
      }

      // Round rate to 2 decimal places
      const roundedRate = Math.round(rate * 100) / 100;

      rateMap[roundedFat][snf] = roundedRate;
      resultData.push({
        fat: roundedFat,
        snf: snf,
        rate: roundedRate
      });
    });
  }

  if (resultData.length === 0) {
    throw new Error("No valid data found in the Excel file");
  }

  return {
    data: resultData,
    fatValues: [...new Set(fatValues)].sort((a, b) => a - b),
    snfValues: [...new Set(snfValues.map(s => Math.round(s * 10) / 10))].sort((a, b) => a - b),
    rateMap
  };
};
