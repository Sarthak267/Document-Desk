/**
 * Maps file extensions to readers/writers. This is the "N inputs x M outputs
 * via a shared model" trick: adding a new format means writing one reader
 * and/or one writer, not a new function for every existing format it should
 * convert to/from.
 */
export const READABLE_EXTS = ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

export const FORMAT_LABELS = {
  pdf: 'PDF', docx: 'Word (.docx)', txt: 'Plain text (.txt)', md: 'Markdown (.md)',
  html: 'HTML (.html)', csv: 'CSV (.csv)', xlsx: 'Excel (.xlsx)',
  png: 'PNG image', jpg: 'JPEG image',
};

export function extOf(filename) {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

/** Which output formats make sense for a given input extension. */
export function availableOutputs(ext) {
  if (ext === 'pdf') return ['txt', 'md', 'html', 'docx', 'xlsx', 'csv', 'images-zip'];
  if (ext === 'docx') return ['txt', 'md', 'html', 'pdf', 'xlsx', 'csv'];
  if (ext === 'txt' || ext === 'md') return ['txt', 'md', 'html', 'pdf', 'docx'];
  if (ext === 'csv' || ext === 'xlsx') return ['csv', 'xlsx', 'pdf', 'docx'];
  if (IMAGE_EXTS.includes(ext)) return ['pdf'];
  return [];
}
