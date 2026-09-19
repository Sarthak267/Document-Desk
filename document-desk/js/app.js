import { readPdf, renderPdfPages } from './readers/pdfReader.js';
import { readDocx } from './readers/docxReader.js';
import { readText, readMarkdown } from './readers/textReader.js';
import { readSheet } from './readers/sheetReader.js';
import { writeDocx } from './writers/docxWriter.js';
import { writePdf, imageToPdf } from './writers/pdfWriter.js';
import { writeTxt, writeMarkdown, writeHtml } from './writers/textWriter.js';
import { writeXlsx, writeCsv } from './writers/sheetWriter.js';
import { summarize } from './summarize.js';
import { paragraph, heading } from './model.js';
import { compressImage } from './compress/imageCompress.js';
import { compressPdfBalanced, compressPdfMaximum } from './compress/pdfCompress.js';
import { createZip, downloadBlob } from './zip.js';
import { extOf, availableOutputs, FORMAT_LABELS, IMAGE_EXTS } from './registry.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.js';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------
   Tabs
------------------------------------------------------------------ */
const tabs = ['convert', 'summarize', 'compress'];
function showTab(name) {
  for (const t of tabs) {
    $(`tab-${t}`).classList.toggle('active', t === name);
    $(`panel-${t}`).hidden = t !== name;
  }
}
tabs.forEach((t) => $(`tab-${t}`).addEventListener('click', () => showTab(t)));

/* ------------------------------------------------------------------
   Shared helpers
------------------------------------------------------------------ */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function baseName(filename) {
  return filename.replace(/\.[^.]+$/, '');
}

async function readIntoDocument(file, ext) {
  if (ext === 'pdf') return readPdf(await file.arrayBuffer());
  if (ext === 'docx') return readDocx(await file.arrayBuffer());
  if (ext === 'txt') return readText(await file.text());
  if (ext === 'md') return readMarkdown(await file.text());
  if (ext === 'csv') return readSheet(await file.text(), true);
  if (ext === 'xlsx') return readSheet(await file.arrayBuffer(), false);
  throw new Error(`No reader for .${ext} files.`);
}

function setupDropZone(zoneEl, inputEl, onFile) {
  zoneEl.addEventListener('click', () => inputEl.click());
  zoneEl.addEventListener('dragover', (e) => { e.preventDefault(); zoneEl.classList.add('drag'); });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag'));
  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag');
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
  inputEl.addEventListener('change', () => {
    if (inputEl.files[0]) onFile(inputEl.files[0]);
  });
}

/* ==================================================================
   CONVERT TAB
================================================================== */
const convertState = { file: null, ext: null };

setupDropZone($('convert-drop'), $('convert-input'), (file) => {
  const ext = extOf(file.name);
  const outputs = availableOutputs(ext);

  if (outputs.length === 0) {
    setConvertStatus(`"${file.name}" isn't a format this tool reads yet.`, 'warn');
    return;
  }

  convertState.file = file;
  convertState.ext = ext;

  $('convert-filename').textContent = file.name;
  $('convert-filesize').textContent = humanSize(file.size);
  $('convert-fileinfo').hidden = false;

  const select = $('convert-output');
  select.innerHTML = '';
  for (const out of outputs) {
    const opt = document.createElement('option');
    opt.value = out;
    opt.textContent = out === 'images-zip' ? 'Pages as images (.zip of PNGs)' : FORMAT_LABELS[out] || out;
    select.appendChild(opt);
  }
  $('convert-run').disabled = false;
  setConvertStatus(`Ready — choose an output format and convert.`, 'idle');
  $('convert-result').hidden = true;
});

function setConvertStatus(msg, kind) {
  const el = $('convert-status');
  el.textContent = msg;
  el.dataset.kind = kind;
}

$('convert-run').addEventListener('click', async () => {
  const { file, ext } = convertState;
  if (!file) return;
  const outFmt = $('convert-output').value;

  $('convert-run').disabled = true;
  setConvertStatus('Converting…', 'idle');
  $('convert-result').hidden = true;

  try {
    let blob, outName, note = '';

    if (IMAGE_EXTS.includes(ext)) {
      const dataUrl = await fileToDataUrl(file);
      blob = await imageToPdf(dataUrl, file.type);
      outName = `${baseName(file.name)}.pdf`;
    } else if (outFmt === 'images-zip') {
      const pages = await renderPdfPages(await file.arrayBuffer());
      const entries = pages.map((dataUrl, i) => ({
        path: `page-${String(i + 1).padStart(2, '0')}.png`,
        content: dataUrlToBytes(dataUrl),
      }));
      blob = createZip(entries);
      outName = `${baseName(file.name)}-pages.zip`;
      note = `${pages.length} page${pages.length === 1 ? '' : 's'} exported as PNG.`;
    } else {
      const doc = await readIntoDocument(file, ext);
      const result = await convertDocument(doc, outFmt);
      blob = result.blob;
      outName = `${baseName(file.name)}.${outFmt}`;
      note = result.note || '';
    }

    convertState.resultBlob = blob;
    convertState.resultName = outName;

    $('convert-result-name').textContent = outName;
    $('convert-result-size').textContent = humanSize(blob.size);
    $('convert-result-note').textContent = note;
    $('convert-result-note').hidden = !note;
    $('convert-result').hidden = false;
    setConvertStatus('Done.', 'ok');
  } catch (err) {
    console.error(err);
    setConvertStatus(`Conversion failed: ${err.message}`, 'warn');
  } finally {
    $('convert-run').disabled = false;
  }
});

async function convertDocument(doc, outFmt) {
  switch (outFmt) {
    case 'txt':
      return { blob: new Blob([writeTxt(doc)], { type: 'text/plain' }) };
    case 'md':
      return { blob: new Blob([writeMarkdown(doc)], { type: 'text/markdown' }) };
    case 'html':
      return { blob: new Blob([writeHtml(doc)], { type: 'text/html' }) };
    case 'docx':
      return { blob: writeDocx(doc) };
    case 'pdf':
      return { blob: await writePdf(doc) };
    case 'xlsx': {
      const { blob, usedFallback } = writeXlsx(doc);
      return { blob, note: usedFallback ? 'No table detected in the source — content was placed one paragraph per row.' : '' };
    }
    case 'csv': {
      const { blob, usedFallback, multiSheet } = writeCsv(doc);
      let note = '';
      if (usedFallback) note = 'No table detected in the source — content was placed one paragraph per row.';
      else if (multiSheet) note = 'Source had multiple tables — CSV can only hold one sheet, so the first table was used.';
      return { blob, note };
    }
    default:
      throw new Error(`Unsupported output format: ${outFmt}`);
  }
}

$('convert-download').addEventListener('click', () => {
  if (convertState.resultBlob) downloadBlob(convertState.resultBlob, convertState.resultName);
});

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ==================================================================
   SUMMARIZE TAB
================================================================== */
const summaryState = { doc: null, result: null, baseName: 'document' };

setupDropZone($('summarize-drop'), $('summarize-input'), async (file) => {
  const ext = extOf(file.name);
  if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
    setSummaryStatus('Summarize works on PDF, Word, text, or Markdown files.', 'warn');
    return;
  }

  setSummaryStatus('Reading document…', 'idle');
  $('summarize-fileinfo').hidden = true;
  $('summarize-result').hidden = true;

  try {
    const doc = await readIntoDocument(file, ext);
    summaryState.doc = doc;
    summaryState.baseName = baseName(file.name);

    $('summarize-filename').textContent = file.name;
    $('summarize-fileinfo').hidden = false;
    $('summarize-run').disabled = false;
    setSummaryStatus('Ready — choose a length and summarize.', 'idle');
  } catch (err) {
    setSummaryStatus(`Could not read that file: ${err.message}`, 'warn');
  }
});

function setSummaryStatus(msg, kind) {
  const el = $('summarize-status');
  el.textContent = msg;
  el.dataset.kind = kind;
}

$('summarize-run').addEventListener('click', () => {
  if (!summaryState.doc) return;
  const ratio = Number($('summarize-length').value);
  const result = summarize(summaryState.doc, { ratio });
  summaryState.result = result;

  if (!result.stats) {
    setSummaryStatus('No prose sentences found to summarize (this document may be entirely tables).', 'warn');
    $('summarize-result').hidden = true;
    return;
  }

  $('summarize-text').textContent = result.summary;
  $('summarize-keywords').innerHTML = '';
  for (const kw of result.keywords) {
    const chip = document.createElement('span');
    chip.className = 'kw-chip';
    chip.textContent = kw;
    $('summarize-keywords').appendChild(chip);
  }

  $('summarize-stats').textContent =
    `${result.stats.originalSentences} sentences -> ${result.stats.summarySentences}. ` +
    `${result.stats.originalWords} words -> ${result.stats.summaryWords} ` +
    `(${result.stats.reductionPct}% shorter).`;

  $('summarize-result').hidden = false;
  setSummaryStatus('Done. This is an extractive summary — see the note above the result.', 'ok');
});

$('summarize-export').addEventListener('click', async () => {
  const result = summaryState.result;
  if (!result) return;
  const fmt = $('summarize-export-format').value;

  const summaryDoc = {
    blocks: [
      heading('Summary', 1),
      paragraph(result.summary),
      heading('Key terms', 2),
      paragraph(result.keywords.join(', ')),
    ],
    sourceFormat: 'summary',
  };

  let blob;
  if (fmt === 'txt') blob = new Blob([writeTxt(summaryDoc)], { type: 'text/plain' });
  else if (fmt === 'md') blob = new Blob([writeMarkdown(summaryDoc)], { type: 'text/markdown' });
  else if (fmt === 'docx') blob = writeDocx(summaryDoc);
  else if (fmt === 'pdf') blob = await writePdf(summaryDoc);

  downloadBlob(blob, `${summaryState.baseName}-summary.${fmt}`);
});

/* ==================================================================
   COMPRESS TAB
================================================================== */
const compressState = { kind: null, file: null, resultBlob: null };

function showCompressMode(kind) {
  $('compress-image-options').hidden = kind !== 'image';
  $('compress-pdf-options').hidden = kind !== 'pdf';
}

setupDropZone($('compress-drop'), $('compress-input'), (file) => {
  const ext = extOf(file.name);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === 'pdf';

  if (!isImage && !isPdf) {
    setCompressStatus('Compress works on images (PNG/JPG) or PDF files.', 'warn');
    return;
  }

  compressState.kind = isPdf ? 'pdf' : 'image';
  compressState.file = file;
  showCompressMode(compressState.kind);

  $('compress-filename').textContent = file.name;
  $('compress-filesize-before').textContent = humanSize(file.size);
  $('compress-fileinfo').hidden = false;
  $('compress-run').disabled = false;
  $('compress-result').hidden = true;
  setCompressStatus('Ready.', 'idle');
});

function setCompressStatus(msg, kind) {
  const el = $('compress-status');
  el.textContent = msg;
  el.dataset.kind = kind;
}

$('compress-run').addEventListener('click', async () => {
  const { kind, file } = compressState;
  if (!file) return;

  $('compress-run').disabled = true;
  setCompressStatus('Compressing…', 'idle');

  try {
    let blob, outExt, mode = null;

    if (kind === 'image') {
      const quality = Number($('compress-image-quality').value);
      const scale = Number($('compress-image-scale').value);
      const format = $('compress-image-format').value;
      blob = await compressImage(file, { quality, scale, format });
      outExt = format === 'image/png' ? 'png' : 'jpg';
    } else {
      mode = document.querySelector('input[name="pdf-compress-mode"]:checked').value;
      const buf = await file.arrayBuffer();
      blob = mode === 'maximum'
        ? await compressPdfMaximum(buf, {
            scale: Number($('compress-pdf-scale').value),
            quality: Number($('compress-pdf-quality').value),
          })
        : await compressPdfBalanced(buf);
      outExt = 'pdf';
    }

    compressState.resultBlob = blob;
    compressState.resultName = `${baseName(file.name)}-compressed.${outExt}`;

    const before = file.size, after = blob.size;
    const pct = before ? Math.round((1 - after / before) * 100) : 0;

    $('compress-filesize-before-2').textContent = humanSize(before);
    $('compress-filesize-before-2').textContent = humanSize(before);
    $('compress-filesize-after').textContent = humanSize(after);
    $('compress-result-pct').textContent = pct > 0 ? `${pct}% smaller` : (pct < 0 ? `${-pct}% larger` : 'about the same size');
    $('compress-result-pct').dataset.kind = pct > 0 ? 'ok' : 'warn';

    const growWarning = $('compress-grow-warning');
    if (pct < 0 && kind === 'pdf') {
      growWarning.hidden = false;
      growWarning.textContent = mode === 'maximum'
        ? 'This PDF grew because it was already mostly text — Maximum mode turns text into pictures of text, which is bigger than the original text data. Try Balanced mode for text-heavy documents; use Maximum only for scanned or image-heavy PDFs.'
        : 'This PDF was already compact — there was little left to remove.';
    } else {
      growWarning.hidden = true;
    }
    $('compress-result').hidden = false;
    setCompressStatus('Done.', 'ok');
  } catch (err) {
    console.error(err);
    setCompressStatus(`Compression failed: ${err.message}`, 'warn');
  } finally {
    $('compress-run').disabled = false;
  }
});

$('compress-download').addEventListener('click', () => {
  if (compressState.resultBlob) downloadBlob(compressState.resultBlob, compressState.resultName);
});

document.querySelectorAll('input[name="pdf-compress-mode"]').forEach((r) =>
  r.addEventListener('change', (e) => {
    $('compress-maximum-options').hidden = e.target.value !== 'maximum';
    $('compress-maximum-warning').hidden = e.target.value !== 'maximum';
  })
);

/* ---- range input live labels ---- */
document.querySelectorAll('input[type="range"]').forEach((input) => {
  const label = document.getElementById(input.id + '-value');
  if (!label) return;
  const update = () => (label.textContent = input.dataset.suffix ? input.value + input.dataset.suffix : input.value);
  input.addEventListener('input', update);
  update();
});
