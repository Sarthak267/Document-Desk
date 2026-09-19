import { heading, paragraph, listItem, table as tableBlock } from '../model.js';

/** Plain text -> Document: blank-line-separated paragraphs. */
export function readText(text) {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(p.replace(/\n/g, ' ')));
  return { blocks, sourceFormat: 'txt' };
}

/** Markdown -> Document: headings, lists, pipe tables, and paragraphs. */
export function readMarkdown(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length) {
      blocks.push(paragraph(paraBuffer.join(' ').trim()));
      paraBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      blocks.push(heading(h[2].trim(), h[1].length));
      i++;
      continue;
    }

    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      flushPara();
      blocks.push(listItem(li[2].trim(), /\d+\./.test(li[1])));
      i++;
      continue;
    }

    // Pipe table: a row line followed by a |---|---| separator line.
    if (/\|/.test(line) && lines[i + 1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      flushPara();
      const rows = [parseMdRow(line)];
      i += 2;
      while (i < lines.length && /\|/.test(lines[i])) {
        rows.push(parseMdRow(lines[i]));
        i++;
      }
      blocks.push(tableBlock(rows, true));
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      i++;
      continue;
    }

    paraBuffer.push(line.trim());
    i++;
  }
  flushPara();

  return { blocks, sourceFormat: 'md' };
}

function parseMdRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}
