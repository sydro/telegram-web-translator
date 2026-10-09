import { startTelegramTranslator } from './app.js';

const storageArea = {
  get: (...args) => chrome.storage.sync.get(...args),
  set: (...args) => chrome.storage.sync.set(...args),
  onChanged: chrome.storage.onChanged,
};

void startTelegramTranslator({
  document: globalThis.document,
  location: globalThis.location,
  storageArea,
  translatorApi: globalThis.Translator,
});
