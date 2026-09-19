/**
 * Minimal ZIP writer — stored (uncompressed) entries only.
 * Dependency-free so the tool runs offline. DOCX files are just zips with
 * specific XML parts inside, so this doubles as our DOCX packager.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function u16(view, off, val) { view.setUint16(off, val, true); }
function u32(view, off, val) { view.setUint32(off, val, true); }

/**
 * @param {{path: string, content: string|Uint8Array}[]} files
 * @returns {Blob}
 */
export function createZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const { time, day } = dosDateTime(now);

  const entries = files.map((f) => ({
    nameBytes: encoder.encode(f.path),
    dataBytes: typeof f.content === 'string' ? encoder.encode(f.content) : f.content,
  }));
  for (const e of entries) e.crc = crc32(e.dataBytes);

  let localSize = 0, centralSize = 0;
  for (const e of entries) {
    localSize += 30 + e.nameBytes.length + e.dataBytes.length;
    centralSize += 46 + e.nameBytes.length;
  }
  const buffer = new ArrayBuffer(localSize + centralSize + 22);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  for (const e of entries) {
    e.localOffset = offset;
    u32(view, offset, 0x04034b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 6, 0x0800);
    u16(view, offset + 8, 0);
    u16(view, offset + 10, time);
    u16(view, offset + 12, day);
    u32(view, offset + 14, e.crc);
    u32(view, offset + 18, e.dataBytes.length);
    u32(view, offset + 22, e.dataBytes.length);
    u16(view, offset + 26, e.nameBytes.length);
    u16(view, offset + 28, 0);
    offset += 30;
    bytes.set(e.nameBytes, offset); offset += e.nameBytes.length;
    bytes.set(e.dataBytes, offset); offset += e.dataBytes.length;
  }

  const centralStart = offset;
  for (const e of entries) {
    u32(view, offset, 0x02014b50);
    u16(view, offset + 4, 20);
    u16(view, offset + 6, 20);
    u16(view, offset + 8, 0x0800);
    u16(view, offset + 10, 0);
    u16(view, offset + 12, time);
    u16(view, offset + 14, day);
    u32(view, offset + 16, e.crc);
    u32(view, offset + 20, e.dataBytes.length);
    u32(view, offset + 24, e.dataBytes.length);
    u16(view, offset + 28, e.nameBytes.length);
    u16(view, offset + 30, 0);
    u16(view, offset + 32, 0);
    u16(view, offset + 34, 0);
    u16(view, offset + 36, 0);
    u32(view, offset + 38, 0);
    u32(view, offset + 42, e.localOffset);
    offset += 46;
    bytes.set(e.nameBytes, offset); offset += e.nameBytes.length;
  }

  u32(view, offset, 0x06054b50);
  u16(view, offset + 4, 0);
  u16(view, offset + 6, 0);
  u16(view, offset + 8, entries.length);
  u16(view, offset + 10, entries.length);
  u32(view, offset + 12, centralSize);
  u32(view, offset + 16, centralStart);
  u16(view, offset + 20, 0);

  return new Blob([buffer], { type: 'application/zip' });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
