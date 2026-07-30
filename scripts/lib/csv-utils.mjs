/**
 * Shared CSV utilities — uses papaparse for consistent parsing across scripts.
 * Always use these instead of split(',') / join(',') to avoid
 * corrupting values that contain commas (ICU plural syntax, etc.).
 */

import Papa from 'papaparse';

/**
 * Parse a CSV line into fields. Delegates to papaparse for correctness.
 * @param {string} line
 * @returns {string[]}
 */
export function csvParseLine(line) {
  const result = Papa.parse(line.trim(), { quoteChar: '"' });
  return result.data[0] || [];
}

/**
 * Escape a value for CSV output. Wraps in quotes if the value contains
 * commas, double quotes, or newlines. Internal quotes are escaped as "".
 * @param {string} val
 * @returns {string}
 */
export function csvEscape(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Read a CSV file. Returns { header: string[], rows: string[][] }.
 * @param {string} filePath
 * @param {object} fs - Node fs module
 * @returns {{ header: string[], rows: string[][] }}
 */
export function readCSV(filePath, fs) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const result = Papa.parse(text, { header: false, skipEmptyLines: true });
  const data = result.data;
  const header = data[0] || [];
  const rows = data.slice(1);
  return { header, rows };
}

/**
 * Write a CSV file from header and rows.
 * @param {string} filePath
 * @param {string[]} header
 * @param {string[][]} rows
 * @param {object} fs - Node fs module
 */
export function writeCSV(filePath, header, rows, fs) {
  const lines = [
    header.map(csvEscape).join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}
