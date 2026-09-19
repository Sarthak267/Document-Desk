import { collectTables, flattenToText } from '../model.js';

/**
 * Document -> workbook. If the document has table blocks, each becomes a
 * sheet. If it has none (a prose PDF/DOCX with no tabular data), we still
 * produce something useful: one paragraph per row in a single "Content"
 * column, so the manager gets a spreadsheet rather than an error.
 */
function buildWorkbook(doc) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const tables = collectTables(doc);

  if (tables.length === 0) {
    const text = flattenToText(doc);
    const rows = [['Content'], ...text.split('\n\n').filter(Boolean).map((p) => [p])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Content');
    return { wb, usedFallback: true };
  }

  tables.forEach((t, i) => {
    const name = `Table ${i + 1}`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.rows), name);
  });
  return { wb, usedFallback: false };
}

export function writeXlsx(doc) {
  const XLSX = window.XLSX;
  const { wb, usedFallback } = buildWorkbook(doc);
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), usedFallback };
}

export function writeCsv(doc) {
  const XLSX = window.XLSX;
  const { wb, usedFallback } = buildWorkbook(doc);
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(firstSheet);
  return { blob: new Blob([csv], { type: 'text/csv' }), usedFallback, multiSheet: wb.SheetNames.length > 1 };
}
