/**
 * Two honestly-different strategies, because "compress a PDF" means very
 * different things depending on what's inside it:
 *
 *  - "balanced": re-saves the PDF with object streams and no size increase
 *    from metadata. Keeps text selectable and vectors sharp. Shrinks
 *    image-light, text-heavy PDFs only modestly — there often isn't much to
 *    squeeze out of already-compact text.
 *  - "maximum": rasterizes every page to a JPEG and rebuilds the PDF from
 *    those images. Can shrink image-heavy or scanned PDFs dramatically, but
 *    the output is no longer selectable/searchable text — it becomes a
 *    picture of the page. The UI must say this plainly before someone picks it.
 */
export async function compressPdfBalanced(arrayBuffer) {
  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.load(arrayBuffer, { updateMetadata: false });
  pdf.setTitle('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setProducer('');
  pdf.setCreator('');
  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function compressPdfMaximum(arrayBuffer, { scale = 1.3, quality = 0.6 } = {}) {
  const pdfjsLib = window.pdfjsLib;
  const { PDFDocument } = window.PDFLib;

  const srcPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const outPdf = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= srcPdf.numPages; pageNum++) {
    const page = await srcPdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
    const jpegBytes = dataUrlToBytes(jpegDataUrl);
    const img = await outPdf.embedJpg(jpegBytes);

    const outPage = outPdf.addPage([viewport.width, viewport.height]);
    outPage.drawImage(img, { x: 0, y: 0, width: viewport.width, height: viewport.height });
  }

  const bytes = await outPdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
