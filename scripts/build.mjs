import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { build } from 'esbuild';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(projectRoot, 'dist');

async function copy(source, destination) {
  const outputPath = resolve(outputRoot, destination);
  await mkdir(dirname(outputPath), { recursive: true });
  await cp(resolve(projectRoot, source), outputPath, { recursive: true });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(resolve(outputRoot, 'popup'), { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(projectRoot, 'src/content/index.js')],
    outfile: resolve(outputRoot, 'content.js'),
    bundle: true,
    format: 'iife',
    target: 'chrome138',
    sourcemap: true,
  }),
  build({
    entryPoints: [resolve(projectRoot, 'src/popup/popup.js')],
    outfile: resolve(outputRoot, 'popup/popup.js'),
    bundle: true,
    format: 'esm',
    target: 'chrome138',
    sourcemap: true,
  }),
  copy('src/popup/index.html', 'popup/index.html'),
  copy('src/popup/popup.css', 'popup/popup.css'),
  copy('src/icons', 'icons'),
  copy('src/manifest.json', 'manifest.json'),
]);

const manifestPath = resolve(outputRoot, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
