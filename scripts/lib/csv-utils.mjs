/**
 * Shared CSV utilities — used by all translation scripts.
 * Always use these instead of split(',') / join(',') to avoid
 * corrupting values that contain commas (ICU plural syntax, etc.).
 */

/**
 * Parse a CSV line into fields. Handles quoted fields containing commas,
 * escaped quotes (""), and newlines within quotes.
 */
export function csvParseLine(line) {
  const fields = [];
  let curr = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(curr); curr = '';
    } else {
      curr += ch;
    }
  }
  fields.push(curr);
  return fields;
}

/**
 * Escape a value for CSV output. Wraps in quotes if the value contains
 * commas, double quotes, or newlines. Internal quotes are escaped as "".
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
 */
export function readCSV(filePath, fs) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  const header = csvParseLine(lines[0]);
  const rows = lines.slice(1).map(csvParseLine);
  return { header, rows };
}

/**
 * Write a CSV file from header and rows.
 */
export function writeCSV(filePath, header, rows, fs) {
  const lines = [
    header.map(csvEscape).join(','),
    ...rows.map(r => r.map(csvEscape).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}
