import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { verifyDistribution } from '../../scripts/verify-dist.mjs';

describe('distribution verification', () => {
  it.each([
    ['host_permissions', ['https://example.com/*']],
    ['optional_host_permissions', ['https://example.com/*']],
    ['optional_permissions', ['tabs']],
  ])('rejects an unexpected %s field before accepting the package', async (field, value) => {
    const directory = await mkdtemp(join(tmpdir(), 'telegram-translator-verify-'));
    const manifest = JSON.parse(await readFile(resolve('src/manifest.json'), 'utf8'));
    manifest[field] = value;
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));

    await expect(verifyDistribution(directory)).rejects.toThrow(field);
  });
});
