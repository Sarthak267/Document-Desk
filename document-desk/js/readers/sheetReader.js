import { heading, table as tableBlock } from '../model.js';

/** CSV or XLSX -> Document: one table block per sheet. */
export function readSheet(data, isCsvText) {
  const XLSX = window.XLSX;
  const workbook = isCsvText
    ? XLSX.read(data, { type: 'string' })
    : XLSX.read(data, { type: 'array' });

  const blocks = [];
  const multiSheet = workbook.SheetNames.length > 1;

  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
    if (!rows.length) continue;
    if (multiSheet) blocks.push(heading(name, 2));
    const stringRows = rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : String(c))));
    blocks.push(tableBlock(stringRows, true));
  }

  return { blocks, sourceFormat: isCsvText ? 'csv' : 'xlsx' };
}
