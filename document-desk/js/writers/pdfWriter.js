/**
 * Document -> PDF, via pdf-lib. Does its own text layout: word-wrapping,
 * pagination when content runs off the page, and a simple grid renderer
 * for tables. Not a layout engine — good enough for a working, readable PDF,
 * not a pixel-perfect reproduction of the source.
 */
export async function writePdf(doc) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28, pageHeight = 841.89; // A4
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function newPage() {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function ensureSpace(needed) {
    if (y - needed < margin) newPage();
  }

  function wrapText(text, f, size, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const candidate = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawParagraph(text, { f = font, size = 11, color = rgb(0.1, 0.1, 0.1), lineHeight = 1.35, indent = 0 } = {}) {
    for (const para of text.split('\n\n')) {
      const lines = wrapText(para, f, size, contentWidth - indent);
      for (const line of lines) {
        ensureSpace(size * lineHeight);
        page.drawText(line, { x: margin + indent, y: y - size, size, font: f, color });
        y -= size * lineHeight;
      }
      y -= size * 0.5;
    }
  }

  const HEADING_SIZES = { 1: 20, 2: 16, 3: 14, 4: 12, 5: 12, 6: 11 };

  for (const block of doc.blocks) {
    if (block.type === 'heading') {
      const size = HEADING_SIZES[block.level] || 12;
      ensureSpace(size * 2);
      y -= size * 0.4;
      drawParagraph(block.text, { f: bold, size, lineHeight: 1.2 });
      continue;
    }

    if (block.type === 'paragraph') {
      drawParagraph(block.text);
      continue;
    }

    if (block.type === 'list-item') {
      drawParagraph((block.ordered ? '\u2022 ' : '\u2022 ') + block.text, { indent: 14 });
      continue;
    }

    if (block.type === 'table') {
      drawTable(block);
      continue;
    }

    if (block.type === 'image') {
      await drawImage(block);
      continue;
    }
  }

  async function drawImage(block) {
    try {
      const bytes = dataUrlToBytes(block.dataUrl);
      const isPng = /png/i.test(block.mime || block.dataUrl);
      const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(1, contentWidth / img.width);
      const w = img.width * scale, h = img.height * scale;
      ensureSpace(h + 10);
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
      y -= h + 14;
    } catch {
      // Unsupported image encoding — skip rather than fail the whole export.
    }
  }

  function drawTable(block) {
    const cols = block.rows[0]?.length || 1;
    const colWidth = contentWidth / cols;
    const cellPad = 5;
    const fontSize = 9;

    for (let ri = 0; ri < block.rows.length; ri++) {
      const row = block.rows[ri];
      const isHeader = block.header && ri === 0;
      const f = isHeader ? bold : font;

      const wrapped = row.map((cell) => wrapText(String(cell), f, fontSize, colWidth - cellPad * 2));
      const rowLines = Math.max(1, ...wrapped.map((w) => w.length));
      const rowHeight = rowLines * fontSize * 1.3 + cellPad * 2;

      ensureSpace(rowHeight);
      const rowTop = y;

      for (let ci = 0; ci < cols; ci++) {
        const x = margin + ci * colWidth;
        page.drawRectangle({
          x, y: rowTop - rowHeight, width: colWidth, height: rowHeight,
          borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5,
          color: isHeader ? rgb(0.94, 0.94, 0.94) : undefined,
        });
        const lines = wrapped[ci] || [];
        lines.forEach((line, li) => {
          page.drawText(line, {
            x: x + cellPad,
            y: rowTop - cellPad - fontSize - li * fontSize * 1.3,
            size: fontSize, font: f, color: rgb(0.1, 0.1, 0.1),
          });
        });
      }
      y = rowTop - rowHeight;
    }
    y -= 12;
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Embed a single raster image as one full page — used for the "image -> PDF" conversion. */
export async function imageToPdf(dataUrl, mime) {
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const bytes = dataUrlToBytes(dataUrl);
  const img = /png/i.test(mime) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

  const margin = 36;
  const maxW = 595.28 - margin * 2, maxH = 841.89 - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale, h = img.height * scale;

  const page = pdf.addPage([595.28, 841.89]);
  page.drawImage(img, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h });

  const bytesOut = await pdf.save();
  return new Blob([bytesOut], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
