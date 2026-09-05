/** Copies pdf.js standard fonts and CMaps into public/pdfjs so non-embedded
 *  fonts and CJK encodings render. Runs before dev and build. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const out = path.resolve('public/pdfjs');
for (const sub of ['standard_fonts', 'cmaps']) {
  const src = path.join(pkgDir, sub);
  const dst = path.join(out, sub);
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');
