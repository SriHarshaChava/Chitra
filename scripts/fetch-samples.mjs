// Downloads public-domain sample photos used by the end-to-end tests into samples/
// (which Git ignores). Run with: npm run samples
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLES = [
  {
    // NASA photo from the International Space Station, Nikon D3S (public domain).
    // Source: rawpy test suite, https://github.com/letmaik/rawpy
    name: 'iss030e122639.NEF',
    url: 'https://raw.githubusercontent.com/letmaik/rawpy/main/test/iss030e122639.NEF',
  },
];

const dir = 'samples';
mkdirSync(dir, { recursive: true });

for (const sample of SAMPLES) {
  const path = join(dir, sample.name);
  if (existsSync(path)) {
    console.log(`✓ ${sample.name} already present`);
    continue;
  }
  console.log(`↓ ${sample.name}`);
  const response = await fetch(sample.url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${sample.url}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  console.log(`  saved ${path} (sha256 ${hash.slice(0, 16)}…)`);
}
