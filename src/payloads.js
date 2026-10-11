// Pure payload builders. No DOM access. Each builder returns { payload, warnings }.

function escapeWifi(s) {
  // One pass, so a backslash is escaped exactly once (equivalent to "escape \ first").
  return String(s).replace(/([\\;,:"])/g, '\\$1');
}

function escapeVcard(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function buildText({ value }) {
  return { payload: value || '', warnings: [] };
}

// A scheme is letters/digits/+/- followed by ":" not followed by a digit,
// so "example.com:8080" and "localhost:3000" are treated as scheme-less.
const SCHEME_RE = /^[a-z][a-z0-9+-]*:(?!\d)/i;

function buildUrl({ value }) {
  const warnings = [];
  let url = (value || '').trim();
  if (!url) return { payload: '', warnings };
  if (!SCHEME_RE.test(url)) url = 'https://' + url;
  let ok = true;
  try { new URL(url); } catch { ok = false; }
  if (ok && /^https?:\/\/[^/?#]*\s/i.test(url)) ok = false;
  if (!ok) warnings.push('This doesn’t look like a valid URL. It will still be encoded as typed.');
  return { payload: url, warnings };
}

function buildWifi({ ssid = '', password = '', security = 'WPA', hidden = false }) {
  const warnings = [];
  if (!ssid) return { payload: '', warnings: ['SSID is required'] };
  const q = v => /^[0-9a-fA-F]+$/.test(v) ? `"${escapeWifi(v)}"` : escapeWifi(v);
  let out = `WIFI:T:${security};S:${q(ssid)};`;
  if (security !== 'nopass') {
    if (!password) warnings.push('No password entered. Choose “None (open)” if the network has no password.');
    out += `P:${q(password)};`;
  }
  if (hidden) out += 'H:true;';
  if (security === 'WEP' && password && ![5, 13, 16, 29].includes(password.length) &&
      !(/^[0-9a-fA-F]+$/.test(password) && [10, 26, 32, 58].includes(password.length))) {
    warnings.push('WEP keys are usually 5 or 13 characters (or 10 or 26 hex digits).');
  }
  return { payload: out + ';', warnings };
}

function buildVcard(f) {
  const warnings = [];
  const v = k => (f[k] || '').trim();
  const first = v('first'), last = v('last');
  const fn = v('fn') || [first, last].filter(Boolean).join(' ');
  if (!fn) return { payload: '', warnings: ['A name is required'] };
  const e = escapeVcard;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e(last)};${e(first)};;;`, `FN:${e(fn)}`];
  if (v('org')) lines.push(`ORG:${e(v('org'))}`);
  if (v('title')) lines.push(`TITLE:${e(v('title'))}`);
  if (v('tel')) lines.push(`TEL;TYPE=CELL:${e(v('tel'))}`);
  if (v('email')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) warnings.push('The email address looks incomplete.');
    lines.push(`EMAIL;TYPE=INTERNET:${e(v('email'))}`);
  }
  if (v('url')) lines.push(`URL:${e(v('url'))}`);
  const adr = ['street', 'city', 'region', 'postal', 'country'].map(v);
  if (adr.some(Boolean)) lines.push(`ADR;TYPE=WORK:;;${adr.map(e).join(';')}`);
  if ((f.note || '').trim()) lines.push(`NOTE:${e(f.note.trim())}`);
  lines.push('END:VCARD');
  return { payload: lines.join('\r\n') + '\r\n', warnings };
}

const BUILDERS = { text: buildText, url: buildUrl, wifi: buildWifi, vcard: buildVcard };

function buildPayload(type, fields) {
  return BUILDERS[type](fields);
}

// --- Color helpers (WCAG relative luminance) ---
function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// "#abc", "abc", "#AABBCC" -> "#aabbcc"; null if not a 3- or 6-digit hex color.
function normalizeHex(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return '#' + h.toLowerCase();
}

function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAYLOADS = { escapeWifi, escapeVcard, buildText, buildUrl, buildWifi, buildVcard, buildPayload, luminance, contrastRatio, normalizeHex };
if (typeof module !== 'undefined') module.exports = PAYLOADS;
