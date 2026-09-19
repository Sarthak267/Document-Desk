# Document Desk

Convert, summarize, and compress documents entirely in the browser — no
upload, no server, no account. Built for the day-to-day paperwork a manager
handles: turning a PDF report into something editable, pulling a table out
of a document into Excel, getting the gist of a long document fast, or
shrinking a file to email it.

## Deploying

`index.html` sits at the archive root, so it works on any static host —
Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3. Upload the folder as-is.

To run locally you need a web server (ES modules and the vendored libraries
don't load over `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## The three tools

### Convert
Reads a source file into a shared internal representation (headings,
paragraphs, lists, tables — see `js/model.js`), then writes that same
representation out in the target format. That's what makes many-format
support tractable: each format needs one reader and/or one writer, not a
hand-written path to every other format.

| From | To |
|---|---|
| PDF | Text, Markdown, HTML, Word, Excel (if tabular), page images (.zip) |
| Word (.docx) | Text, Markdown, HTML, PDF, Excel (if tabular) |
| Text / Markdown | Text, Markdown, HTML, PDF, Word |
| CSV / Excel | CSV, Excel, PDF, Word |
| PNG / JPG | PDF |

### Summarize
Extractive summarization: scores each sentence in the document by word
frequency and returns the highest-scoring sentences, unchanged, in their
original order. **This is a statistical technique, not AI** — there's no
model reading for meaning. It won't paraphrase, infer, or fact-check; it
selects sentences that are already there. That makes it fast and fully
private, and a reasonable way to surface likely-important sentences in a
long report — not a substitute for reading anything where precision matters.

### Compress
- **Images**: re-encodes at a lower quality and/or smaller dimensions via canvas.
- **PDF — Balanced**: restructures the file (object streams, stripped
  metadata) without touching content. Text stays selectable. Modest savings
  on already-compact text PDFs, more on ones with redundant structure.
- **PDF — Maximum**: rasterizes every page to a JPEG and rebuilds the PDF
  from those images. Can shrink scanned or image-heavy PDFs dramatically —
  but the output is a picture of each page, not selectable text. The tool
  warns before you use it, and will tell you plainly if it made a text-heavy
  file *bigger* (rasterizing text is often less compact than the text itself).

## Architecture

```
js/model.js              shared Document representation (the "IR")
js/readers/               source format -> Document
  pdfReader.js             PDF (pdf.js) — also detects headings/tables heuristically
  docxReader.js            DOCX (mammoth)
  textReader.js            TXT / Markdown
  sheetReader.js           CSV / XLSX (SheetJS)
js/writers/                Document -> target format
  docxWriter.js            hand-built minimal OOXML (no bundler needed)
  pdfWriter.js             PDF (pdf-lib) — does its own text layout/pagination
  textWriter.js            TXT / Markdown / HTML
  sheetWriter.js           XLSX / CSV (SheetJS)
js/summarize.js            extractive sentence scoring
js/compress/               image and PDF size reduction
js/zip.js                  dependency-free ZIP writer (also used to build .docx)
js/registry.js             format detection + which outputs are valid per input
js/app.js                  UI wiring for all three tabs
vendor/                    pdf.js, pdf-lib, mammoth, SheetJS — vendored so the
                            tool works fully offline once deployed
```

### Adding a format
Write a reader (`bytes/text -> Document`) and/or a writer (`Document ->
Blob`), then add it to `js/registry.js`'s `availableOutputs()`. Nothing else
needs to change — the Convert tab's dropdown and logic are driven entirely
by the registry.

## Honest limitations

- **Layout fidelity**: this reconstructs documents from their *content*
  (headings, paragraphs, tables), not their pixels. A converted file will
  read correctly but won't visually match the source's fonts, colors, or
  exact spacing.
- **PDF table detection** is pattern-based (column alignment via x-position
  gaps), not a layout engine. Works well on clearly-gridded tables; can miss
  borderless tables with tight spacing, or misread multi-column page layouts.
- **Scanned PDFs** (no text layer, just images of pages) can't be read at
  all — there's no OCR here. Convert will produce an empty or near-empty
  result for these; Compress's Maximum mode still works on them, since it
  operates on pixels, not text.
- **Images aren't re-embedded** when writing to DOCX — a source document's
  embedded images are dropped in Word output (PDF output does keep them).
- **Composite/merged PDF cells and rotated text** aren't handled — the
  positional heuristics assume left-to-right, non-rotated text.

None of this is a black box: `js/readers/pdfReader.js` in particular documents
its heuristics inline if you want to see or adjust exactly how table/heading
detection works.
