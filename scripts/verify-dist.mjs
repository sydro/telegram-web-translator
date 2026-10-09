import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultDistribution = resolve(import.meta.dirname, '..', 'dist');
const expectedMatches = [
  'https://web.telegram.org/a/*',
  'https://web.telegram.org/k/*',
];
const iconSizes = [16, 32, 48, 128];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPngSize(buffer, relativePath) {
  const signature = '89504e470d0a1a0a';
  assert(buffer.subarray(0, 8).toString('hex') === signature, `${relativePath} non è un PNG valido`);
  assert(buffer.subarray(12, 16).toString('ascii') === 'IHDR', `${relativePath} non contiene IHDR`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export async function verifyDistribution(distribution = defaultDistribution) {
  const requireFile = async (relativePath) => {
    await access(resolve(distribution, relativePath));
  };
  const manifest = JSON.parse(await readFile(resolve(distribution, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version deve essere 3');
  assert(manifest.minimum_chrome_version === '138', 'minimum_chrome_version deve essere 138');
  assert(JSON.stringify(manifest.permissions) === JSON.stringify(['storage']), 'È consentito solo il permesso storage');
  assert(!Object.hasOwn(manifest, 'host_permissions'), 'host_permissions non è consentito');
  assert(!Object.hasOwn(manifest, 'optional_host_permissions'), 'optional_host_permissions non è consentito');
  assert(!Object.hasOwn(manifest, 'optional_permissions'), 'optional_permissions non è consentito');
  assert(manifest.content_scripts?.length === 1, 'È richiesto un solo content script');
  assert(
    JSON.stringify(manifest.content_scripts[0].matches) === JSON.stringify(expectedMatches),
    'I match pattern devono essere limitati a Telegram Web A e K',
  );
  assert(manifest.action?.default_popup === 'popup/index.html', 'Popup azione non configurato');

  await Promise.all([
    requireFile('content.js'),
    requireFile('popup/index.html'),
    requireFile('popup/popup.js'),
    requireFile('popup/popup.css'),
  ]);

  for (const size of iconSizes) {
    const relativePath = `icons/icon-${size}.png`;
    assert(manifest.icons?.[size] === relativePath, `Icona manifest ${size}px non configurata`);
    assert(manifest.action?.default_icon?.[size] === relativePath, `Icona azione ${size}px non configurata`);
    const dimensions = readPngSize(await readFile(resolve(distribution, relativePath)), relativePath);
    assert(dimensions.width === size && dimensions.height === size, `${relativePath} deve misurare ${size}x${size}`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  await verifyDistribution();
  console.log('Distribuzione verificata: Manifest V3, permessi, host, asset e icone validi.');
}
