/**
 * Document IR (intermediate representation).
 *
 * Every reader (PDF, DOCX, TXT/MD, CSV/XLSX) converts its source into this
 * same shape. Every writer converts this same shape into its target format.
 * That's what turns "N input formats x M output formats" into just N + M
 * pieces of code instead of N*M — the same trick the SQL generator used
 * with its Schema object.
 *
 * A Document is: { blocks: Block[], sourceFormat: string }
 * A Block is one of:
 *   { type: 'heading',   level: 1-6, text }
 *   { type: 'paragraph', text }
 *   { type: 'list-item', text, ordered }
 *   { type: 'table',     rows: string[][], header: boolean }
 *   { type: 'image',     dataUrl, mime }
 */

export function heading(text, level = 1) { return { type: 'heading', level, text }; }
export function paragraph(text) { return { type: 'paragraph', text }; }
export function listItem(text, ordered = false) { return { type: 'list-item', text, ordered }; }
export function table(rows, header = true) { return { type: 'table', rows, header }; }
export function image(dataUrl, mime) { return { type: 'image', dataUrl, mime }; }

/** Every block's readable text, tables rendered as pipe-separated rows. */
export function blockText(block) {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'list-item':
      return block.text;
    case 'table':
      return block.rows.map((r) => r.join(' | ')).join('\n');
    default:
      return '';
  }
}

/** Flatten a whole document to plain text — used as summarizer input and TXT export. */
export function flattenToText(doc) {
  return doc.blocks.map(blockText).filter(Boolean).join('\n\n');
}

/** All table blocks in the document, in order. */
export function collectTables(doc) {
  return doc.blocks.filter((b) => b.type === 'table');
}

export function hasTable(doc) {
  return doc.blocks.some((b) => b.type === 'table');
}

/**
 * Split a document's prose into sentences, each tagged with which paragraph
 * it came from (position 0 = first). Tables/headings are excluded — the
 * summarizer only scores prose sentences.
 */
export function extractSentences(doc) {
  const sentences = [];
  let paraIndex = 0;
  for (const block of doc.blocks) {
    if (block.type !== 'paragraph' && block.type !== 'list-item') continue;
    const text = block.text.trim();
    if (!text) continue;
    const parts = splitSentences(text);
    parts.forEach((s, i) => {
      sentences.push({ text: s, paraIndex, sentIndexInPara: i });
    });
    paraIndex++;
  }
  return sentences;
}

/** Lightweight sentence splitter — handles common abbreviations well enough for scoring. */
export function splitSentences(text) {
  const guarded = text.replace(/\b(Mr|Mrs|Ms|Dr|Sr|Jr|vs|etc|e\.g|i\.e|Inc|Ltd|No)\./gi, (m) =>
    m.replace('.', '\u0000')
  );
  const raw = guarded.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  return raw.map((s) => s.replace(/\u0000/g, '.').trim()).filter((s) => s.length > 0);
}
