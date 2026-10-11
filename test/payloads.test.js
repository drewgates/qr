const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/payloads.js');
const QR = require('../src/qr.js');

const wifi = o => P.buildWifi({ security: 'WPA', hidden: false, password: '', ...o }).payload;
const vcard = o => P.buildVcard(o).payload;

test('Wi-Fi basic', () => {
  assert.equal(wifi({ ssid: 'Home', password: 'secret123' }), 'WIFI:T:WPA;S:Home;P:secret123;;');
});

test('Wi-Fi escaping', () => {
  assert.equal(wifi({ ssid: 'My;Net', password: 'a\\b,c:d"e' }), 'WIFI:T:WPA;S:My\\;Net;P:a\\\\b\\,c\\:d\\"e;;');
});

test('Wi-Fi open + hidden', () => {
  assert.equal(wifi({ ssid: 'Coffee', security: 'nopass', password: 'ignored', hidden: true }), 'WIFI:T:nopass;S:Coffee;H:true;;');
  // The PRP table expects S:Cafe unquoted, but "Cafe" is all hex digits, so its own ZXing rule quotes it.
  assert.equal(wifi({ ssid: 'Cafe', security: 'nopass', hidden: true }), 'WIFI:T:nopass;S:"Cafe";H:true;;');
});

test('Wi-Fi hex SSID is quoted', () => {
  assert.ok(wifi({ ssid: 'ABCDEF', password: 'pw' }).includes('S:"ABCDEF";'));
  assert.ok(wifi({ ssid: 'Home', password: '1234abcd' }).includes('P:"1234abcd";'));
});

test('Wi-Fi WEP and missing SSID', () => {
  assert.equal(wifi({ ssid: 'Old', security: 'WEP', password: 'abcde' }), 'WIFI:T:WEP;S:Old;P:"abcde";;');
  const r = P.buildWifi({ ssid: '', password: 'x', security: 'WPA' });
  assert.equal(r.payload, '');
  assert.deepEqual(r.warnings, ['SSID is required']);
});

test('URL without scheme gets https://', () => {
  assert.equal(P.buildUrl({ value: '  example.com/a ' }).payload, 'https://example.com/a');
  assert.equal(P.buildUrl({ value: 'example.com:8080/x' }).payload, 'https://example.com:8080/x');
});

test('URL keeps case and existing schemes', () => {
  assert.equal(P.buildUrl({ value: 'https://Ex.com/Path' }).payload, 'https://Ex.com/Path');
  assert.equal(P.buildUrl({ value: 'mailto:a@b.co' }).payload, 'mailto:a@b.co');
  assert.deepEqual(P.buildUrl({ value: 'https://Ex.com/Path' }).warnings, []);
});

test('URL soft-warns but still encodes', () => {
  const r = P.buildUrl({ value: 'not a url' });
  assert.equal(r.payload, 'https://not a url');
  assert.equal(r.warnings.length, 1);
});

test('vCard escaping', () => {
  assert.ok(vcard({ first: 'A', last: 'B', org: 'Smith, Jones; Co' }).includes('\r\nORG:Smith\\, Jones\\; Co\r\n'));
  assert.equal(P.escapeVcard('a\\b'), 'a\\\\b');
});

test('vCard newlines in note', () => {
  assert.ok(vcard({ first: 'A', note: 'a\nb' }).includes('\r\nNOTE:a\\nb\r\n'));
});

test('vCard CRLF framing', () => {
  const p = vcard({ first: 'José', last: 'Müller', tel: '+1 555 0100', email: 'j@m.de', street: '1 Main', city: 'Köln' });
  assert.ok(p.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  assert.ok(p.endsWith('END:VCARD\r\n'));
  assert.ok(!/[^\r]\n/.test(p), 'every newline is preceded by CR');
  assert.ok(p.includes('\r\nN:Müller;José;;;\r\nFN:José Müller\r\n'));
  assert.ok(p.includes('\r\nADR;TYPE=WORK:;;1 Main;Köln;;;\r\n'));
});

test('vCard omits empty properties', () => {
  const p = vcard({ first: '雷', last: '李' });
  assert.equal(p, 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:李;雷;;;\r\nFN:雷 李\r\nEND:VCARD\r\n');
  for (const k of ['ORG', 'TEL', 'ADR', 'EMAIL', 'URL', 'NOTE', 'TITLE']) assert.ok(!p.includes(k + ':') && !p.includes(k + ';'));
});

test('vCard FN override and name required', () => {
  assert.ok(vcard({ first: 'Lei', last: 'Li', fn: '李雷' }).includes('\r\nFN:李雷\r\n'));
  assert.equal(P.buildVcard({}).payload, '');
});

test('contrast ratio', () => {
  assert.ok(Math.abs(P.contrastRatio('#000000', '#ffffff') - 21) < 1e-9);
  assert.equal(P.contrastRatio('#777777', '#777777'), 1);
});

test('encode: 2,953 bytes fits at L, fails cleanly at M', () => {
  const s = 'é'.repeat(1476) + 'x'; // 2,953 UTF-8 bytes, forces byte mode
  assert.equal(QR.utf8Length(s), 2953);
  const l = QR.encode(s, 'L', false);
  assert.ok(l.qr);
  assert.equal(l.qr.version, 40);
  const m = QR.encode(s, 'M', false);
  assert.equal(m.qr, undefined);
  assert.match(m.error, /level M/);
  assert.match(m.error, /Try level L/);
});

test('encode honors the requested level unless boost is on', () => {
  for (const ecc of ['L', 'M', 'Q', 'H']) {
    const r = QR.encode('hello', ecc, false);
    assert.equal(r.ecc, ecc);
  }
  assert.equal(QR.encode('hello', 'L', true).ecc, 'H');
});

test('SVG is a single path', () => {
  const { qr } = QR.encode('x'.repeat(2000), 'L', false);
  const svg = QR.toSvgString(qr, 4, '#000000', '#ffffff');
  assert.equal((svg.match(/<path/g) || []).length, 1);
  assert.equal((svg.match(/<rect/g) || []).length, 1);
  assert.ok(svg.includes(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`));
});
