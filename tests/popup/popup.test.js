import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindSettingsPopup } from '../../src/popup/popup.js';

function renderPopupFixture() {
  document.body.innerHTML = `
    <form id="settings-form" novalidate>
      <input id="extension-enabled" name="enabled" type="checkbox">
      <input id="delay-ms" name="delayMs" type="number">
      <select id="source-language" name="sourceLanguage"></select>
      <select id="target-language" name="targetLanguage"></select>
      <button id="save-settings" type="submit">Salva</button>
      <p id="settings-status" aria-live="polite"></p>
    </form>
  `;
}

function createStorage(settings = undefined) {
  return {
    get: vi.fn().mockResolvedValue(settings === undefined ? {} : { settings }),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function submitForm() {
  document.querySelector('#settings-form').dispatchEvent(new Event('submit', {
    bubbles: true,
    cancelable: true,
  }));
}

describe('settings popup', () => {
  beforeEach(renderPopupFixture);

  it('hydrates saved values and renders every supported language', async () => {
    const storageArea = createStorage({
      enabled: false,
      delayMs: 1100,
      sourceLanguage: 'fr',
      targetLanguage: 'de',
    });

    await bindSettingsPopup({ document, storageArea });

    expect(document.querySelector('#extension-enabled').checked).toBe(false);
    expect(document.querySelector('#delay-ms').value).toBe('1100');
    expect(document.querySelector('#source-language').value).toBe('fr');
    expect(document.querySelector('#target-language').value).toBe('de');
    expect(document.querySelector('#source-language').options).toHaveLength(39);
    expect(document.querySelector('#target-language').options).toHaveLength(39);
  });

  it('uses Italian and English defaults when storage is empty', async () => {
    await bindSettingsPopup({ document, storageArea: createStorage() });

    expect(document.querySelector('#extension-enabled').checked).toBe(true);
    expect(document.querySelector('#delay-ms').value).toBe('700');
    expect(document.querySelector('#source-language').value).toBe('it');
    expect(document.querySelector('#target-language').value).toBe('en');
  });

  it('saves all valid values and reports success', async () => {
    const storageArea = createStorage();
    await bindSettingsPopup({ document, storageArea });
    document.querySelector('#delay-ms').value = '900';
    document.querySelector('#source-language').value = 'es';
    document.querySelector('#target-language').value = 'fr';

    submitForm();
    await settle();

    expect(storageArea.set).toHaveBeenCalledWith({
      settings: { enabled: true, delayMs: 900, sourceLanguage: 'es', targetLanguage: 'fr' },
    });
    expect(document.querySelector('#settings-status').textContent).toContain('salvate');
  });

  it.each([
    { delay: '350', source: 'it', target: 'en', expected: '300' },
    { delay: '700', source: 'fr', target: 'fr', expected: 'diversa' },
  ])('shows inline validation and does not save invalid values', async ({ delay, source, target, expected }) => {
    const storageArea = createStorage();
    await bindSettingsPopup({ document, storageArea });
    document.querySelector('#delay-ms').value = delay;
    document.querySelector('#source-language').value = source;
    document.querySelector('#target-language').value = target;

    submitForm();
    await settle();

    expect(storageArea.set).not.toHaveBeenCalled();
    expect(document.querySelector('#settings-status').textContent).toContain(expected);
  });

  it('reports a storage failure without closing or clearing the form', async () => {
    const storageArea = createStorage();
    storageArea.set.mockRejectedValue(new Error('sync unavailable'));
    await bindSettingsPopup({ document, storageArea });

    submitForm();
    await settle();

    expect(document.querySelector('#settings-status').textContent).toContain('Impossibile salvare');
    expect(document.querySelector('#delay-ms').value).toBe('700');
  });

  it('persists the enabled toggle immediately without saving draft form changes', async () => {
    const storageArea = createStorage({
      enabled: true,
      delayMs: 700,
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });
    await bindSettingsPopup({ document, storageArea });
    document.querySelector('#delay-ms').value = '1200';
    const enabledToggle = document.querySelector('#extension-enabled');

    enabledToggle.checked = false;
    enabledToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(storageArea.set).toHaveBeenCalledWith({
      settings: {
        enabled: false,
        delayMs: 700,
        sourceLanguage: 'it',
        targetLanguage: 'en',
      },
    });
    expect(document.querySelector('#settings-status').textContent).toContain('disattivata');
  });

  it('removes its submit listener when disposed', async () => {
    const storageArea = createStorage();
    const binding = await bindSettingsPopup({ document, storageArea });
    binding.dispose();

    document.querySelector('#extension-enabled').dispatchEvent(new Event('change', { bubbles: true }));
    submitForm();
    await settle();

    expect(storageArea.set).not.toHaveBeenCalled();
  });
});
