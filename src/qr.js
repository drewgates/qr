// Encoding and rendering helpers around the vendored Nayuki encoder.
// Pure apart from toCanvas, which takes a canvas the caller creates.

const QRGEN = typeof qrcodegen !== 'undefined' ? qrcodegen : require('./qrcodegen.js');

const ECC_NAME = { L: 'LOW', M: 'MEDIUM', Q: 'QUARTILE', H: 'HIGH' };
const ECC_LETTER = ['L', 'M', 'Q', 'H']; // indexed by Ecc.ordinal
const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 }; // byte mode, version 40

function utf8Length(s) {
  return new TextEncoder().encode(s).length;
}

// Fraction of the version-40 data capacity this payload uses at a level (can exceed 1).
function capacityUsed(segs, ecc) {
  const { QrCode, QrSegment } = QRGEN;
  const bits = QrSegment.getTotalBits(segs, 40);
  const cap = QrCode.getNumDataCodewords(40, QrCode.Ecc[ECC_NAME[ecc]]) * 8;
  return bits === Infinity ? Infinity : bits / cap;
}

function encode(payload, ecc, boost = false) {
  const { QrCode, QrSegment } = QRGEN;
  const segs = QrSegment.makeSegments(payload);
  const used = capacityUsed(segs, ecc);
  try {
    const qr = QrCode.encodeSegments(segs, QrCode.Ecc[ECC_NAME[ecc]], 1, 40, -1, !!boost);
    return { qr, used, ecc: ECC_LETTER[qr.errorCorrectionLevel.ordinal] };
  } catch (e) {
    const fits = ECC_LETTER.filter(l => l !== ecc && capacityUsed(segs, l) <= 1);
    const bytes = utf8Length(payload);
    let msg = `Too much data for level ${ecc}: this payload is ${bytes.toLocaleString('en-US')} bytes, ` +
      `and level ${ecc} holds at most ${MAX_BYTES[ecc].toLocaleString('en-US')} bytes (version 40). `;
    msg += fits.length ? `Try level ${fits.join(' or ')}, or shorten the input.`
                       : 'Shorten the input — it doesn’t fit at any level.';
    return { error: msg, used, fits };
  }
}

// All dark modules as one <path>, horizontal runs per row.
function svgPath(qr, qz) {
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.getModule(x, y)) continue;
      let len = 1;
      while (x + len < qr.size && qr.getModule(x + len, y)) len++;
      d += `M${x + qz} ${y + qz}h${len}v1h-${len}z`;
      x += len - 1;
    }
  }
  return d;
}

function toSvgString(qr, qz, fg, bg, label = '') {
  const n = qr.size + qz * 2;
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"` +
    (label ? ` role="img" aria-label="${esc(label)}"` : '') + '>' +
    `<rect width="100%" height="100%" fill="${bg}"/>` +
    `<path d="${svgPath(qr, qz)}" fill="${fg}"/></svg>`;
}

// Integer pixels-per-module; canvas side = (size + 2*qz) * scale.
function toCanvas(qr, scale, qz, fg, bg, canvas) {
  const n = qr.size + qz * 2;
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.getModule(x, y)) continue;
      let len = 1;
      while (x + len < qr.size && qr.getModule(x + len, y)) len++;
      ctx.fillRect((x + qz) * scale, (y + qz) * scale, len * scale, scale);
      x += len - 1;
    }
  }
  return canvas;
}

// Nearest integer scale for a requested pixel size (at least 1 px per module).
function pngScale(qr, qz, requested) {
  return Math.max(1, Math.round(requested / (qr.size + qz * 2)));
}

const QR = { ECC_NAME, ECC_LETTER, MAX_BYTES, utf8Length, encode, svgPath, toSvgString, toCanvas, pngScale };
if (typeof module !== 'undefined') module.exports = QR;
