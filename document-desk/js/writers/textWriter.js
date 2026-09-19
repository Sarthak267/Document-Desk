export function writeTxt(doc) {
  const lines = [];
  for (const b of doc.blocks) {
    if (b.type === 'heading') lines.push(b.text.toUpperCase(), '');
    else if (b.type === 'paragraph') lines.push(b.text, '');
    else if (b.type === 'list-item') lines.push(`- ${b.text}`);
    else if (b.type === 'table') {
      const widths = colWidths(b.rows);
      for (const row of b.rows) lines.push(row.map((c, i) => c.padEnd(widths[i])).join('  '));
      lines.push('');
    }
  }
  return lines.join('\n').trim() + '\n';
}

export function writeMarkdown(doc) {
  const lines = [];
  for (const b of doc.blocks) {
    if (b.type === 'heading') lines.push('#'.repeat(b.level) + ' ' + b.text, '');
    else if (b.type === 'paragraph') lines.push(b.text, '');
    else if (b.type === 'list-item') lines.push((b.ordered ? '1. ' : '- ') + b.text);
    else if (b.type === 'image') lines.push(`![image](${b.dataUrl})`, '');
    else if (b.type === 'table') {
      lines.push('| ' + b.rows[0].join(' | ') + ' |');
      lines.push('| ' + b.rows[0].map(() => '---').join(' | ') + ' |');
      for (const row of b.rows.slice(1)) lines.push('| ' + row.join(' | ') + ' |');
      lines.push('');
    }
  }
  return lines.join('\n').trim() + '\n';
}

export function writeHtml(doc, title = 'Document') {
  const parts = [];
  for (const b of doc.blocks) {
    if (b.type === 'heading') parts.push(`<h${b.level}>${esc(b.text)}</h${b.level}>`);
    else if (b.type === 'paragraph') parts.push(`<p>${esc(b.text).replace(/\n\n/g, '</p><p>')}</p>`);
    else if (b.type === 'list-item') parts.push(`<li>${esc(b.text)}</li>`);
    else if (b.type === 'image') parts.push(`<img src="${b.dataUrl}" alt="" style="max-width:100%">`);
    else if (b.type === 'table') {
      const rows = b.rows
        .map((row, ri) => {
          const tag = b.header && ri === 0 ? 'th' : 'td';
          return `<tr>${row.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`;
        })
        .join('');
      parts.push(`<table border="1" cellpadding="6" cellspacing="0">${rows}</table>`);
    }
  }
  // Group consecutive <li> into a single <ul> for valid markup.
  const html = parts.join('\n').replace(/(<li>.*?<\/li>\n?)+/gs, (m) => `<ul>\n${m}</ul>`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 780px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.6; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f2f2f2; }
  h1, h2, h3 { line-height: 1.25; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function colWidths(rows) {
  const widths = [];
  for (const row of rows) row.forEach((c, i) => { widths[i] = Math.max(widths[i] || 0, c.length); });
  return widths;
}
