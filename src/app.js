// UI wiring. Inlined into the same module after payloads.js and qr.js, so their
// functions (buildPayload, contrastRatio, luminance, encode, toSvgString, toCanvas,
// pngScale, utf8Length, MAX_BYTES) are in scope directly.

const STORE_KEY = 'qr-generator:v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const state = {
  type: 'text', ecc: 'M', boostEcc: false, quietZone: 4, pngSize: 1024,
  fg: '#000000', bg: '#ffffff', remember: false, rememberPassword: false,
  fields: {
    text: { value: '' },
    url: { value: '' },
    wifi: { ssid: '', password: '', security: 'WPA', hidden: false },
    vcard: { first: '', last: '', fn: '', org: '', title: '', tel: '', email: '', url: '',
             street: '', city: '', region: '', postal: '', country: '', note: '' }
  }
};
let current = null; // { qr, payload } of the last successful encode

// ---------- persistence (opt-in; Wi-Fi password excluded unless opted in) ----------
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved || !saved.remember) return;
    for (const k of Object.keys(state)) if (k !== 'fields' && k in saved) state[k] = saved[k];
    for (const t of Object.keys(state.fields)) Object.assign(state.fields[t], saved.fields?.[t] || {});
  } catch { /* storage unavailable */ }
}
function save() {
  try {
    if (!state.remember) { localStorage.removeItem(STORE_KEY); return; }
    const copy = JSON.parse(JSON.stringify(state));
    if (!state.rememberPassword) copy.fields.wifi.password = '';
    localStorage.setItem(STORE_KEY, JSON.stringify(copy));
  } catch { /* storage unavailable */ }
}

// ---------- state <-> form ----------
function fillForms() {
  for (const el of $$('[data-field]')) {
    const [t, k] = el.dataset.field.split('.');
    const v = state.fields[t][k];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  for (const el of $$('[data-setting]')) {
    const k = el.dataset.setting;
    if (el.type === 'radio') el.checked = el.value === state[k];
    else if (el.type === 'checkbox') el.checked = !!state[k];
    else el.value = state[k];
  }
  selectTab(state.type, false);
}

function selectTab(type, focus) {
  state.type = type;
  for (const tab of $$('[role=tab]')) {
    const on = tab.dataset.type === type;
    tab.setAttribute('aria-selected', on);
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
    $('#' + tab.getAttribute('aria-controls')).hidden = !on;
  }
}

// ---------- render ----------
function describe(type, f, payload) {
  switch (type) {
    case 'wifi': return `QR code: Wi-Fi network ${f.ssid}`;
    case 'url': return `QR code: link to ${payload}`;
    case 'vcard': return `QR code: contact card for ${f.fn || [f.first, f.last].filter(Boolean).join(' ')}`;
    default: return `QR code: text, ${[...payload].length} characters`;
  }
}

function render() {
  const f = state.fields[state.type];
  const { payload, warnings } = buildPayload(state.type, f);
  const notes = [...warnings];
  const preview = $('#qr');
  const errorEl = $('#qr-error');
  current = null;
  errorEl.hidden = true;

  if (state.fg.toLowerCase() === state.bg.toLowerCase()) notes.push('Foreground and background are the same color.');
  else {
    if (luminance(state.fg) > luminance(state.bg)) notes.push('Light-on-dark codes fail on some scanners. Use a darker foreground than background.');
    const cr = contrastRatio(state.fg, state.bg);
    if (cr < 4) notes.push(`Low contrast (${cr.toFixed(1)}:1). Aim for at least 4:1 so cameras can read it.`);
  }
  if (state.quietZone < 4) notes.push('The QR spec calls for a 4-module quiet zone. Smaller margins may not scan next to other content.');

  const bytes = utf8Length(payload);
  let result = null;
  if (!payload) {
    const empty = { text: 'Type some text', url: 'Enter a web address', wifi: 'Enter the network name (SSID)', vcard: 'Enter a name' }[state.type];
    preview.innerHTML = `<p class="placeholder">${empty} to make a code.</p>`;
    preview.setAttribute('aria-label', 'No QR code yet');
    // the "required" warning is redundant with the placeholder
    notes.splice(0, warnings.length);
  } else {
    result = encode(payload, state.ecc, state.boostEcc);
    if (result.qr) {
      current = { qr: result.qr, payload };
      const label = describe(state.type, f, payload);
      preview.innerHTML = toSvgString(result.qr, state.quietZone, state.fg, state.bg);
      preview.setAttribute('aria-label', label);
      preview.style.setProperty('--qr-bg', state.bg);
    } else {
      preview.innerHTML = '<p class="placeholder">No code — the input is too large for this level.</p>';
      preview.setAttribute('aria-label', 'No QR code: input too large');
      errorEl.textContent = result.error;
      errorEl.hidden = false;
    }
  }

  // stats
  const qr = current?.qr;
  $('#stat-version').textContent = qr ? qr.version : '—';
  $('#stat-modules').textContent = qr ? `${qr.size}×${qr.size}` : '—';
  $('#stat-bytes').textContent = bytes.toLocaleString();
  $('#stat-level').textContent = qr ? result.ecc + (result.ecc !== state.ecc ? ' (boosted)' : '') : state.ecc;
  const used = result ? result.used : 0;
  const pct = Math.min(100, used * 100);
  const bar = $('#capacity');
  bar.style.setProperty('--used', pct + '%');
  bar.classList.toggle('over', used > 1);
  bar.classList.toggle('high', used > 0.85 && used <= 1);
  bar.setAttribute('aria-valuenow', Math.round(used * 100));
  $('#capacity-label').textContent =
    `${bytes.toLocaleString()} / ${MAX_BYTES[state.ecc].toLocaleString()} bytes at level ${state.ecc}` +
    (used > 0 && Math.abs(used - bytes / MAX_BYTES[state.ecc]) > 0.02 ? ` · ${Math.round(used * 100)}% of capacity` : '');

  $('#warnings').innerHTML = notes.map(n => `<li>${escapeHtml(n)}</li>`).join('');
  $('#payload-raw').textContent = payload.replace(/\r\n/g, '↵\n') || '(empty)';

  // png size hint
  if (qr) {
    const s = pngScale(qr, state.quietZone, state.pngSize);
    $('#png-hint').textContent = `Exports at ${((qr.size + state.quietZone * 2) * s).toLocaleString()} px (${s} px per module)`;
  } else $('#png-hint').textContent = '';

  for (const b of $$('[data-needs-code]')) b.disabled = !current;
  $('#copy-payload').disabled = !payload;
  save();
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

let timer;
const renderSoon = () => { clearTimeout(timer); timer = setTimeout(render, 150); };

// ---------- exports ----------
function fileName(ext) {
  const d = new Date();
  const ymd = [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  return `qr-${state.type}-${ymd}.${ext}`;
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pngBlob() {
  const { qr } = current;
  const canvas = toCanvas(qr, pngScale(qr, state.quietZone, state.pngSize), state.quietZone, state.fg, state.bg,
    document.createElement('canvas'));
  return new Promise(res => canvas.toBlob(res, 'image/png'));
}
function status(msg) {
  const el = $('#status');
  el.textContent = msg;
  clearTimeout(status.t);
  status.t = setTimeout(() => { el.textContent = ''; }, 2500);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* unsupported */ }
  ta.remove();
  return ok;
}

// ---------- wiring ----------
function wire() {
  // tabs with arrow-key navigation
  const tabs = $$('[role=tab]');
  for (const tab of tabs) {
    tab.addEventListener('click', () => { selectTab(tab.dataset.type, false); render(); });
    tab.addEventListener('keydown', e => {
      const i = tabs.indexOf(tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      selectTab(tabs[(next + tabs.length) % tabs.length].dataset.type, true);
      render();
    });
  }

  for (const el of $$('[data-field]')) {
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const [t, k] = el.dataset.field.split('.');
      state.fields[t][k] = el.type === 'checkbox' ? el.checked : el.value;
      el.type === 'checkbox' || el.tagName === 'SELECT' ? render() : renderSoon();
    });
  }
  // display name follows first + last until edited
  const fn = $('[data-field="vcard.fn"]');
  const syncFn = () => { fn.placeholder = [state.fields.vcard.first, state.fields.vcard.last].filter(Boolean).join(' ') || 'From first + last name'; };
  $$('[data-field="vcard.first"],[data-field="vcard.last"]').forEach(el => el.addEventListener('input', syncFn));
  syncFn();

  for (const el of $$('[data-setting]')) {
    el.addEventListener(el.type === 'number' ? 'input' : 'change', () => {
      const k = el.dataset.setting;
      if (el.type === 'radio') { if (!el.checked) return; state[k] = el.value; }
      else if (el.type === 'checkbox') state[k] = el.checked;
      else if (el.type === 'number') {
        const n = Math.round(Number(el.value));
        if (!Number.isFinite(n) || el.value === '') return;
        state[k] = Math.min(Number(el.max), Math.max(Number(el.min), n));
      } else state[k] = el.value;
      $('#remember-pw').disabled = !state.remember;
      el.type === 'number' ? renderSoon() : render();
    });
    if (el.type === 'number') el.addEventListener('change', () => { el.value = state[el.dataset.setting]; });
  }
  $('#remember-pw').disabled = !state.remember;

  const pwToggle = $('#pw-toggle');
  pwToggle.addEventListener('click', () => {
    const pw = $('#wifi-password');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    pwToggle.setAttribute('aria-pressed', show);
    pwToggle.textContent = show ? 'Hide' : 'Show';
  });

  $('#dl-svg').addEventListener('click', () => {
    if (!current) return;
    const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + toSvgString(current.qr, state.quietZone, state.fg, state.bg);
    download(new Blob([svg], { type: 'image/svg+xml' }), fileName('svg'));
  });
  $('#dl-png').addEventListener('click', async () => {
    if (current) download(await pngBlob(), fileName('png'));
  });

  const copyImg = $('#copy-img');
  if (navigator.clipboard?.write && window.ClipboardItem && window.isSecureContext) {
    copyImg.hidden = false;
    copyImg.addEventListener('click', async () => {
      if (!current) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]);
        status('Image copied');
      } catch {
        status('This browser blocked copying the image. Use Download PNG instead.');
      }
    });
  }
  $('#copy-payload').addEventListener('click', async () => {
    const { payload } = buildPayload(state.type, state.fields[state.type]);
    status(payload && await copyText(payload) ? 'Payload copied' : 'Couldn’t copy the payload');
  });
}

load();
fillForms();
wire();
render();
