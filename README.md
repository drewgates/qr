# QR Code Generator

A single-file, offline QR code generator: text, URL, Wi-Fi and vCard payloads, selectable
error correction (L/M/Q/H), live preview, SVG/PNG export. Nothing leaves the page — a
Content-Security-Policy meta tag blocks all network requests.

```
LLM Disclosure:

This project was generated entirely by a large language model working from the include PRP.md. No warranty is offered or implied.
```

**Use it:** open `index.html` in a browser (from disk is fine), or host it on any static server.
That file is the whole app.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | The shipped app, with everything below inlined |
| `src/qrcodegen.js` | Nayuki's encoder, compiled from upstream TypeScript, MIT header kept |
| `src/payloads.js` | Pure payload builders (`buildText/Url/Wifi/Vcard`, escaping, contrast) |
| `src/qr.js` | `encode()` (honors the chosen ECC level), SVG path and canvas rendering |
| `src/app.js` | UI state and wiring |
| `src/index.template.html` | Markup and CSS with `/*@inline …*/` markers |
| `scripts/inline.mjs` | Rebuilds `index.html` from `src/` |
| `test/payloads.test.js` | `node:test` unit tests, no npm dependencies |

## Develop

```sh
node --test            # unit tests (note: `node --test test/` fails on Node 22+; use this form)
node scripts/inline.mjs   # rebuild index.html after editing src/
```

## Notes and deviations from the PRP

- **Hex quoting conflict in the PRP.** The PRP's test table expects `S:Cafe` unquoted, but its
  own (ZXing) rule quotes any all-hex value, and C, a, f, e are all hex digits. The code follows
  the rule (`S:"Cafe"`); the test uses `Coffee` for the open+hidden case and asserts `Cafe` is quoted.
  Worth confirming on real devices that quoted SSIDs join correctly on iOS.
- **Capacity bar** fills by actual encoded bits versus version-40 capacity, so numeric or
  alphanumeric text (which the encoder packs more densely) isn't shown as "over" when it fits.
  The label still reads in bytes, as specified.
- **Remembering values** is off by default; when on, the Wi-Fi password is excluded unless
  the second checkbox is ticked.

## Still to do by hand (PRP validation levels 3–4)

Automated checks covered: unit tests, zero console errors and zero network requests from
`file://` in Chromium, every type × level exported as PNG and decoded back to the exact payload,
2-color pixel-aligned PNGs, single-path SVG, error/warning states, keyboard tabs, 360 px layout.

Not yet done: scanning with iOS Camera and Android, joining a real Wi-Fi network, checking the
vCard contact sheet on phones, Firefox/Safari console checks, and a Lighthouse accessibility run.
