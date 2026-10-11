PRP: Single-Page QR Code Generator
Oct 10, 2026 · @Drew
Goal
Build a single-file, offline-capable web page (index.html) that generates QR codes for four payload types — plain text, URL, Wi-Fi and vCard — with a user-selectable error-correction level (L, M, Q, H), live preview, and SVG/PNG export. No build step, no backend, no network calls at runtime.
Terminology note: the request says "levels of parity." QR codes don't use parity bits; they use Reed–Solomon error correction with four standard levels. The UI calls this "Error correction" and shows each level's recovery percentage so users understand the trade-off.
Why
• Most free QR sites track scans, inject redirects or ads, or upload Wi-Fi passwords to a server. A local page keeps secrets on the device.
• Higher error correction lets a code survive damage, glare or a centered logo; lower correction fits more data in a smaller, easier-to-scan symbol. Users should choose.
• One file with zero install is easy to audit, host on any static server, or open from disk.
What
User-visible behavior:
1. Pick a type from a tab bar: Text · URL · Wi-Fi · vCard. Each shows its own form.
2. Pick error correction: L (~7%), M (~15%, default), Q (~25%), H (~30%).
3. The QR preview updates as the user types (debounced ~150 ms).
4. Under the preview: the QR version (1–40), module count, encoded byte length, and a capacity bar showing bytes used vs. the max for the chosen level.
5. If the payload exceeds capacity, show an inline error naming the limit and suggesting a lower level — never a blank or broken image.
6. Export: Download SVG, Download PNG (at a chosen pixel size), Copy image to clipboard where supported, and Copy raw payload text.
7. Appearance options: module size / output size, quiet zone (default 4 modules), foreground and background color with a low-contrast warning.
Out of scope: logo embedding, scan analytics, dynamic/short-link QR, batch generation, QR decoding/scanning, accounts or storage beyond optional localStorage of the last form values.
Success criteria
[ ] The whole app is one index.html (vendored encoder inlined) under 60 KB unminified, and works opened via file:// with the network disabled.
[ ] Zero runtime dependencies beyond one vendored, MIT-licensed QR encoder (or a hand-written one); no frameworks, no CDN, no build tooling.
[ ] All four types produce codes that scan correctly on current iOS Camera and Android (Google Lens / stock camera) at each of L, M, Q, H.
[ ] Wi-Fi codes join the network on iOS and Android for WPA/WPA2/WPA3, WEP and open networks, including hidden SSIDs and SSIDs/passwords containing ; , : \ ".
[ ] vCard codes open the "Add contact" sheet with name, phone, email, org, title, URL and address populated, including non-ASCII names (e.g. "José Müller", "李雷").
[ ] The selected error-correction level is the level actually encoded (no silent "boost" unless the user turns it on), and the displayed version matches the symbol.
[ ] Over-capacity input shows a clear message instead of throwing.
[ ] SVG export is crisp at any size; PNG export is pixel-aligned with no anti-aliased blur between modules.
[ ] Keyboard-operable, labelled form controls; WCAG AA contrast for UI text; preview has an alt/aria-label describing the payload type.
[ ] Automated payload-builder tests pass (see Validation loop).
All needed context
References
• Nayuki QR Code generator library (GitHub) — MIT, single-file JS/TS, no dependencies, explicit ECC level, version and mask control. Recommended encoder to vendor.
• ZXing "Barcode Contents" wiki — de facto format for WIFI: and other QR payloads that phone cameras follow.
• RFC 2426 — vCard 3.0 — target version for widest phone support; RFC 6350 — vCard 4.0 for reference only.
• ISO/IEC 18004:2015 — the QR Code standard (paid); only needed if hand-writing the encoder.
Error-correction levels
Capacity is for byte mode at version 40 (177×177 modules), the largest symbol. Real limits for UTF-8 text are lower when characters are multi-byte.
Level
Recovers up to
Max bytes (v40)
Use when
L
~7% of codewords
2,953
Clean screens, maximum data
M (default)
~15%
2,331
General use
Q
~25%
1,663
Printed, handled outdoors
H
~30%
1,273
Damage-prone surfaces or a future logo overlay
Payload formats
Text — the string as entered, encoded as UTF-8 bytes. Let the encoder choose numeric/alphanumeric/byte segments automatically.
URL — trim whitespace; if no scheme is present, prepend https://. Validate with new URL() and show a soft warning (not a block) if it fails. Do not change case.
Wi-Fi
WIFI:T:<WPA|WEP|nopass>;S:<ssid>;P:<password>;H:<true|false>;;
• T:WPA covers WPA, WPA2 and WPA3-transition networks; nopass for open networks (omit P:).
• H:true only when "Hidden network" is checked; omit otherwise.
• Escape \ ; , : " in SSID and password with a leading backslash, escaping \ first.
• An SSID or password made entirely of hex digits may be misread as hex; wrap it in double quotes, per ZXing.
vCard 3.0
BEGIN:VCARD
VERSION:3.0
N:<Last>;<First>;;;
FN:<First Last>
ORG:<Org>
TITLE:<Title>
TEL;TYPE=CELL:<phone>
EMAIL;TYPE=INTERNET:<email>
URL:<url>
ADR;TYPE=WORK:;;<street>;<city>;<region>;<postal>;<country>
NOTE:<note>
END:VCARD
• Lines end in CRLF (\r\n). N and FN are required; derive FN from first + last if the user doesn't edit it.
• In text values, escape \ → \\, , → \,, ; → \;, newline → \n.
• Omit any property whose fields are all empty. No line folding needed.
Gotchas
• Nayuki's encodeText boosts the ECC level by default when it fits in the same version. Call QrCode.encodeSegments(segs, ecl, 1, 40, -1, false) so the chosen level is honored; offer "Boost when free" as an opt-in toggle.
• The spec requires a 4-module quiet zone; allow 0–8 but default to 4 and warn below 4.
• PNG: draw on a canvas at an integer pixels-per-module scale with imageSmoothingEnabled = false, then scale the output size to a multiple of the module count.
• SVG: render all dark modules as one <path> (e.g. M x y h1v1h-1z runs) with shape-rendering="crispEdges" — one <rect> per module bloats files at v40.
• Inverted (light-on-dark) codes fail on some scanners; warn if foreground luminance is higher than background, and when contrast ratio is below ~4:1.
• navigator.clipboard.write with images needs a secure context and fails on file:// in some browsers; feature-detect and hide the button rather than erroring.
• Never log or persist the Wi-Fi password; if remembering form values, exclude it unless the user opts in.
Implementation blueprint
File layout
qr-generator/
├── index.html          # the app: markup, <style>, <script type="module"> — the only shipped file
├── src/
│   ├── qrcodegen.js    # vendored Nayuki encoder (MIT header kept), inlined into index.html
│   └── payloads.js     # pure payload builders, also inlined; exported for tests
├── test/
│   └── payloads.test.js  # node:test, no npm deps
├── scripts/
│   └── inline.mjs      # optional ~20-line Node script that inlines src/ into index.html
└── LICENSE-THIRD-PARTY  # Nayuki MIT notice
If the inline script feels like a build step, ship index.html with the code already inlined and keep src/ as the editable copy; either way the deployed artifact is one file.
Data model
// state is the single source of truth; the UI renders from it
const state = {
  type: 'text',               // 'text' | 'url' | 'wifi' | 'vcard'
  ecc: 'M',                   // 'L' | 'M' | 'Q' | 'H'
  boostEcc: false,
  quietZone: 4,               // modules
  pngSize: 1024,              // px, snapped to a multiple of module count
  fg: '#000000',
  bg: '#ffffff',
  fields: {
    text:  { value: '' },
    url:   { value: '' },
    wifi:  { ssid: '', password: '', security: 'WPA', hidden: false },
    vcard: { first: '', last: '', fn: '', org: '', title: '', tel: '',
             email: '', url: '', street: '', city: '', region: '',
             postal: '', country: '', note: '' }
  }
};
Tasks (in order)
1. Vendor the encoder. Copy Nayuki's JavaScript build into src/qrcodegen.js, keep its license header, expose QrCode, QrSegment, and QrCode.Ecc.
2. Write payloads.js — pure functions with no DOM access: buildText, buildUrl, buildWifi, buildVcard, plus helpers escapeWifi and escapeVcard. Each returns { payload: string, warnings: string[] }.
3. Write tests first for step 2 (see Validation loop) and make them pass.
4. Markup. Header; type tab bar (role="tablist"); one <form> per type (only the active one visible); settings panel (ECC radio group with recovery % in labels, boost toggle, quiet zone, size, colors); preview panel with stats, capacity bar, error slot and export buttons.
5. Encode + render. encode(payload, ecc, boost) wraps QrSegment.makeSegments and QrCode.encodeSegments in try/catch and returns { qr } or { error }. toSvgString(qr, quietZone, fg, bg) builds one path. toCanvas(qr, scale, quietZone, fg, bg) paints modules with fillRect.
6. Wire state. Input events update state and call a debounced render(). render() builds the payload, encodes, updates preview, stats (version, qr.size, UTF-8 byte length via TextEncoder), capacity bar and warnings.
7. Exports. SVG via Blob + object URL; PNG via canvas.toBlob; copy image via ClipboardItem (feature-detected); copy payload via navigator.clipboard.writeText with a <textarea> fallback. File names like qr-wifi-2026-10-10.svg.
8. Polish. Contrast warning, quiet-zone warning, "Show password" toggle, optional localStorage of last values (Wi-Fi password excluded by default), dark-mode CSS via prefers-color-scheme, responsive layout down to 360 px.
9. Accessibility pass. Labels on every input, aria-live="polite" on the error/stats region, visible focus rings, preview role="img" with an aria-label like "QR code: Wi-Fi network HomeNet".
Pseudocode
function escapeWifi(s) {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

function buildWifi({ ssid, password, security, hidden }) {
  const warnings = [];
  if (!ssid) return { payload: '', warnings: ['SSID is required'] };
  const q = v => /^[0-9a-fA-F]+$/.test(v) ? `"${escapeWifi(v)}"` : escapeWifi(v);
  let out = `WIFI:T:${security};S:${q(ssid)};`;
  if (security !== 'nopass') out += `P:${q(password)};`;
  if (hidden) out += 'H:true;';
  return { payload: out + ';', warnings };
}

function escapeVcard(s) {
  return s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

function encode(payload, ecc, boost) {
  try {
    const segs = QrSegment.makeSegments(payload);
    const qr = QrCode.encodeSegments(segs, QrCode.Ecc[ECC_NAME[ecc]], 1, 40, -1, boost);
    return { qr };
  } catch (e) {
    return { error: `Too much data for level ${ecc}. Try a lower level or shorten the input.` };
  }
}
ECC_NAME maps L/M/Q/H to Nayuki's LOW/MEDIUM/QUARTILE/HIGH.
Validation loop
Run each level in order; fix failures before moving on.
Level 1 — Syntax and static checks
node --check src/payloads.js
node -e "require('node:fs').readFileSync('index.html','utf8')"   # file exists, readable
Open index.html in Chrome, Firefox and Safari with DevTools open: zero console errors on load and while switching every tab.
Level 2 — Unit tests (node --test test/)
Case
Input
Expected payload
Wi-Fi basic
ssid Home, pw secret123, WPA
WIFI:T:WPA;S:Home;P:secret123;;
Wi-Fi escaping
ssid My;Net, pw a\b,c:d"e
WIFI:T:WPA;S:My\;Net;P:a\\b\,c\:d\"e;;
Wi-Fi open + hidden
ssid Cafe, nopass, hidden
WIFI:T:nopass;S:Cafe;H:true;;
Wi-Fi hex SSID
ssid ABCDEF
S:"ABCDEF"; present
URL no scheme
example.com/a
https://example.com/a
URL keeps case
https://Ex.com/Path
unchanged
vCard escaping
org Smith, Jones; Co
ORG:Smith\, Jones\; Co
vCard newlines
note a + newline + b
NOTE:a\nb
vCard CRLF
any
every line ends \r\n; starts BEGIN:VCARD, ends END:VCARD
vCard empty fields
only first/last
no ORG, TEL, ADR lines
Also test encode() in Node with the vendored encoder: a 2,953-byte string encodes at L and fails cleanly at M; with boost=false, qr.errorCorrectionLevel equals the requested level for short inputs.
Level 3 — Scan tests (manual, on real devices)
For each type × each ECC level, scan the on-screen code with iOS Camera and an Android camera, then print one PNG at H and scan it from paper.
• Wi-Fi: phone offers to join and joins a real test network, including one with ; and " in the password, and one hidden SSID.
• vCard: contact sheet shows all filled fields, with accents and CJK characters intact.
• URL: opens the right page. Text: full text shown, including emoji.
• Over-capacity: paste 3,000+ characters at H and confirm the inline error.
Level 4 — Offline and portability
• Disable the network, open from file://, and confirm everything except image clipboard (if unsupported) works.
• DevTools Network tab shows zero requests after load.
• Lighthouse accessibility score ≥ 95.
Final checklist
[ ] node --test test/ passes
[ ] No console errors in Chrome, Firefox, Safari
[ ] All four types × four ECC levels scanned on iOS and Android
[ ] Wi-Fi join confirmed on a real network with special characters
[ ] Zero network requests after load; works from file://
[ ] Third-party license notice included in index.html and LICENSE-THIRD-PARTY
[ ] Over-capacity, empty input and low-contrast states all show helpful messages
Anti-patterns
• Don't pull in a framework, a CSS library or a CDN script — the point is one auditable file.
• Don't use Nayuki's encodeText shortcut; it silently raises the ECC level.
• Don't send payloads to any API or analytics endpoint, ever.
• Don't uppercase URLs to squeeze into alphanumeric mode; paths are case-sensitive.
• Don't render one DOM element or SVG <rect> per module.
• Don't let the canvas smooth or resample the PNG.
• Don't hard-fail on an imperfect URL or email; warn and still encode.
• Don't store the Wi-Fi password in localStorage by default.
Open questions
• Should WPA3-only networks get a separate T:SAE option? Support varies by phone OS; ship with WPA and revisit after device testing.
• Is a logo overlay wanted later? If so, force level H when a logo is present.