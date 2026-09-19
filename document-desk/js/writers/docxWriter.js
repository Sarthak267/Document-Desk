import { createZip } from '../zip.js';

/**
 * Document -> DOCX.
 *
 * A .docx is just a zip with a few required XML parts. Rather than pull in a
 * full docx-authoring library (and the bundler that requires), this builds
 * the minimum valid package by hand: content types, the package relationship,
 * and word/document.xml. Headings/emphasis use direct run formatting rather
 * than named styles, which keeps styles.xml optional and the file still
 * opens cleanly in Word, Google Docs, and LibreOffice.
 *
 * Known gap: images from source documents aren't re-embedded here (only
 * text and tables) — see the README for why.
 */
export function writeDocx(doc) {
  const bodyXml = doc.blocks.map(blockToXml).join('\n');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return createZip([
    { path: '[Content_Types].xml', content: contentTypes },
    { path: '_rels/.rels', content: rootRels },
    { path: 'word/document.xml', content: documentXml },
  ]);
}

function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function run(text, { bold = false, size = 22 } = {}) {
  return `<w:r>${bold ? '<w:rPr><w:b/><w:sz w:val="' + size + '"/></w:rPr>' : `<w:rPr><w:sz w:val="${size}"/></w:rPr>`}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

const HEADING_SIZE = { 1: 32, 2: 28, 3: 26, 4: 24, 5: 22, 6: 22 };

function blockToXml(block) {
  switch (block.type) {
    case 'heading': {
      const size = HEADING_SIZE[block.level] || 24;
      return `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>${run(block.text, { bold: true, size })}</w:p>`;
    }
    case 'paragraph': {
      const paras = block.text.split('\n\n').filter(Boolean);
      return paras
        .map((p) => `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr>${run(p)}</w:p>`)
        .join('\n');
    }
    case 'list-item':
      return `<w:p><w:pPr><w:ind w:left="432"/><w:spacing w:after="80"/></w:pPr>${run((block.ordered ? '' : '\u2022 ') + block.text)}</w:p>`;
    case 'table':
      return tableToXml(block);
    default:
      return '';
  }
}

function tableToXml(block) {
  const cols = block.rows[0]?.length || 1;
  const gridCols = Array(cols).fill('<w:gridCol/>').join('');
  const rowsXml = block.rows
    .map((row, ri) => {
      const isHeader = block.header && ri === 0;
      const cells = row
        .map(
          (cell) =>
            `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="4" w:color="CCCCCC"/></w:tcBorders></w:tcPr><w:p>${run(
              cell,
              { bold: isHeader, size: 20 }
            )}</w:p></w:tc>`
        )
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('\n');

  return `<w:tbl>
    <w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0"/></w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${rowsXml}
  </w:tbl>
  <w:p/>`;
}
