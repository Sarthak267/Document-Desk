import { heading, paragraph, listItem, table as tableBlock, image } from '../model.js';

/**
 * DOCX -> Document, via mammoth (DOCX -> HTML) then a small HTML walk into blocks.
 * Mammoth handles the OOXML parsing; we only need to re-flatten its HTML output
 * into the same block shape every other reader produces.
 */
export async function readDocx(arrayBuffer) {
  const mammoth = window.mammoth;
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    { convertImage: mammoth.images.imgElement((el) => el.read('base64').then((data) => ({ src: `data:${el.contentType};base64,${data}` }))) }
  );

  const doc = new DOMParser().parseFromString(result.value, 'text/html');
  const blocks = [];

  for (const el of doc.body.children) {
    appendElement(el, blocks);
  }

  return { blocks, sourceFormat: 'docx', warnings: result.messages.map((m) => m.message) };
}

function appendElement(el, blocks) {
  const tag = el.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const text = el.textContent.trim();
    if (text) blocks.push(heading(text, Number(tag[1])));
    return;
  }

  if (tag === 'p') {
    const img = el.querySelector('img');
    if (img && img.src.startsWith('data:')) {
      blocks.push(image(img.src, img.src.slice(5, img.src.indexOf(';'))));
    }
    const text = el.textContent.trim();
    if (text) blocks.push(paragraph(text));
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    const ordered = tag === 'ol';
    for (const li of el.children) {
      const text = li.textContent.trim();
      if (text) blocks.push(listItem(text, ordered));
    }
    return;
  }

  if (tag === 'table') {
    const rows = [...el.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('td,th')].map((cell) => cell.textContent.trim())
    );
    if (rows.length) blocks.push(tableBlock(rows, el.querySelector('th') != null));
    return;
  }

  if (tag === 'img' && el.src && el.src.startsWith('data:')) {
    blocks.push(image(el.src, el.src.slice(5, el.src.indexOf(';'))));
    return;
  }

  // Unknown container (e.g. div) — recurse into its children.
  for (const child of el.children) appendElement(child, blocks);
}
