import { heading, paragraph, table as tableBlock } from '../model.js';

/**
 * PDF -> Document.
 *
 * pdf.js gives us positioned text fragments, not paragraphs or tables — this
 * reconstructs both with heuristics:
 *  - fragments on nearly the same y-coordinate are one "line"
 *  - a line whose fragments have a big x-gap between them looks like table
 *    columns; runs of such lines become a table block
 *  - a short, single-fragment line noticeably larger than the page's median
 *    font size is treated as a heading
 *  - everything else is paragraph text, merged across wrapped lines
 *
 * This is pattern-matching, not real layout analysis — dense multi-column
 * layouts or borderless tables with tight spacing can be misread.
 */
export async function readPdf(arrayBuffer) {
  const pdfjsLib = window.pdfjsLib;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const blocks = [];
  const allFontSizes = [];

  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it) => it.str && it.str.trim().length > 0)
      .map((it) => ({
        text: it.str,
        x: it.transform[4],
        y: it.transform[5],
        fontSize: Math.hypot(it.transform[2], it.transform[3]) || 10,
        width: it.width || 0,
      }));
    items.forEach((it) => allFontSizes.push(it.fontSize));
    pages.push(items);
  }

  const medianFont = median(allFontSizes) || 10;

  for (const items of pages) {
    const lines = groupIntoLines(items);
    const rowCandidates = lines.map((line) => toRowCandidate(line, medianFont));

    let i = 0;
    while (i < rowCandidates.length) {
      const run = collectTableRun(rowCandidates, i);
      if (run.length >= 2) {
        const rows = run.map((r) => r.cells);
        blocks.push(tableBlock(normalizeColumns(rows), true));
        i += run.length;
        continue;
      }

      const rc = rowCandidates[i];
      if (rc.isHeading) {
        blocks.push(heading(rc.text, rc.fontSize > medianFont * 1.7 ? 1 : 2));
        i++;
        continue;
      }

      // Merge consecutive plain lines into one paragraph until a blank gap,
      // a heading, or a table-like line interrupts the flow.
      let paraText = rc.text;
      i++;
      while (i < rowCandidates.length) {
        const next = rowCandidates[i];
        const nextRun = collectTableRun(rowCandidates, i);
        if (next.isHeading || nextRun.length >= 2) break;
        paraText += (/[.!?:]$/.test(paraText) ? '\n\n' : ' ') + next.text;
        i++;
      }
      blocks.push(paragraph(paraText.trim()));
    }
  }

  return { blocks, sourceFormat: 'pdf' };
}

/** Render every page of a PDF to a PNG data URL — used for the "pages as images" export. */
export async function renderPdfPages(arrayBuffer, scale = 1.5) {
  const pdfjsLib = window.pdfjsLib;
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL('image/png'));
  }
  return pages;
}

// ---- helpers ----------------------------------------------------------

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function groupIntoLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < Math.max(2, it.fontSize * 0.35));
    if (line) { line.items.push(it); line.y = (line.y + it.y) / 2; }
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

function toRowCandidate(line, medianFont) {
  const items = line.items;
  const text = items.map((it) => it.text).join(' ').replace(/\s+/g, ' ').trim();
  const fontSize = items[0]?.fontSize || medianFont;

  const gaps = [];
  for (let i = 1; i < items.length; i++) {
    gaps.push(items[i].x - (items[i - 1].x + items[i - 1].width));
  }
  const bigGapThreshold = Math.max(18, fontSize * 1.8);
  const cells = [];
  let current = items[0] ? items[0].text : '';
  for (let i = 1; i < items.length; i++) {
    if (gaps[i - 1] > bigGapThreshold) {
      cells.push(current.trim());
      current = items[i].text;
    } else {
      current += ' ' + items[i].text;
    }
  }
  if (current) cells.push(current.trim());

  const isHeading = items.length === 1 && text.length < 90 && fontSize > medianFont * 1.15;

  return { text, fontSize, cells: cells.length ? cells : [text], isHeading };
}

/** Consecutive rows that each split into >=2 cells are treated as one table. */
function collectTableRun(rowCandidates, start) {
  const run = [];
  let i = start;
  while (i < rowCandidates.length && rowCandidates[i].cells.length >= 2 && !rowCandidates[i].isHeading) {
    run.push(rowCandidates[i]);
    i++;
  }
  return run;
}

/** Pad/truncate rows so a table block has a consistent column count. */
function normalizeColumns(rows) {
  const width = mostCommon(rows.map((r) => r.length));
  return rows.map((r) => {
    const copy = r.slice(0, width);
    while (copy.length < width) copy.push('');
    return copy;
  });
}

function mostCommon(nums) {
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  let best = nums[0], bestCount = 0;
  for (const [n, c] of counts) if (c > bestCount) { best = n; bestCount = c; }
  return best;
}
