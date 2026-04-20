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
 * Raw Excel Parser for Dairy Rate Charts
 * Just cleans the data and returns a 2D array for the editable table.
 */
export const getRawExcelData = (fileBuffer: ArrayBuffer): any[][] => {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // 1. Read Excel file and convert to JSON with header: 1 (2D array)
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  if (!rawData || rawData.length === 0) {
    return [];
  }

  // 2. Data Cleaning Layer (MANDATORY)
  const cleanData = rawData
    .map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return "";
        
        let value = cell;
        if (typeof value === 'string') {
          // Trim all string values and remove hidden characters like \xa0
          value = value.trim().replace(/\u00a0/g, ' ');
          
          // Convert numeric strings using Number()
          if (value !== "" && !isNaN(Number(value))) {
            return Number(value);
          }
        }
        return value;
      })
    )
    // Remove fully empty rows
    .filter(row => row.some(cell => cell !== ""));

  return cleanData;
};

/**
 * Keep original parseDairyExcel but make it more lenient or use it as a fallback
 * The user wants to replace strict parsing, so we'll mostly use getRawExcelData
 */
export const parseDairyExcel = (fileBuffer: ArrayBuffer): ParseResult => {
  const cleanData = getRawExcelData(fileBuffer);

  if (cleanData.length === 0) {
    throw new Error("Excel file is empty");
  }

  // Find the first row that looks like a header (contains numbers in subsequent cells)
  let headerRowIndex = -1;
  for (let i = 0; i < cleanData.length; i++) {
    const row = cleanData[i];
    const numericCells = row.slice(1).filter(cell => typeof cell === 'number');
    if (numericCells.length > 0) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0;

  const snfHeaderRow = cleanData[headerRowIndex];
  const snfValues: number[] = [];
  const validColumnIndices: number[] = [];

  for (let j = 1; j < snfHeaderRow.length; j++) {
    const val = snfHeaderRow[j];
    if (typeof val === 'number') {
      snfValues.push(val);
      validColumnIndices.push(j);
    }
  }

  const resultData: RateChartData[] = [];
  const fatValues: number[] = [];
  const rateMap: Record<number, Record<number, number>> = {};

  for (let i = headerRowIndex + 1; i < cleanData.length; i++) {
    const row = cleanData[i];
    const fatVal = row[0];

    if (typeof fatVal !== 'number') continue;

    const roundedFat = Math.round(fatVal * 10) / 10;
    fatValues.push(roundedFat);
    rateMap[roundedFat] = {};

    validColumnIndices.forEach((colIdx, snfIdx) => {
      const snf = Math.round(snfValues[snfIdx] * 10) / 10;
      let rate = row[colIdx];
      if (typeof rate !== 'number') rate = 0;
      const roundedRate = Math.round(rate * 100) / 100;

      rateMap[roundedFat][snf] = roundedRate;
      resultData.push({ fat: roundedFat, snf: snf, rate: roundedRate });
    });
  }

  return {
    data: resultData,
    fatValues: [...new Set(fatValues)].sort((a, b) => a - b),
    snfValues: [...new Set(snfValues)].sort((a, b) => a - b),
    rateMap
  };
};
