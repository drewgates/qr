// Inlines src/*.js into src/index.template.html and writes index.html.
// Usage: node scripts/inline.mjs   (run from the project root)
import { readFileSync, writeFileSync } from 'node:fs';

const tpl = readFileSync('src/index.template.html', 'utf8');
const out = tpl.replace(/\/\*@inline (\S+)\*\//g, (_, path) =>
  `// ---- ${path} ----\n` +
  readFileSync(path, 'utf8')
    .replace(/^.*module\.exports.*$/gm, '')   // Node-only export lines
    .replace(/<\/script/gi, '<\\/script')     // never close the inline script early
    .trimEnd());
writeFileSync('index.html', out);
console.log(`index.html: ${Buffer.byteLength(out).toLocaleString()} bytes`);
