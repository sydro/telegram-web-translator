import {
  SUPPORTED_LANGUAGES,
  loadSettings,
  saveSettings,
  validateSettings,
} from '../shared/settings.js';

function fillLanguageSelect(select, selectedCode) {
  select.replaceChildren();
  for (const { code, label } of SUPPORTED_LANGUAGES) {
    const option = select.ownerDocument.createElement('option');
    option.value = code;
    option.textContent = label;
    option.selected = code === selectedCode;
    select.append(option);
  }
}

export async function bindSettingsPopup({ document, storageArea }) {
  const form = document.querySelector('#settings-form');
  const delayInput = document.querySelector('#delay-ms');
  const sourceSelect = document.querySelector('#source-language');
  const targetSelect = document.querySelector('#target-language');
  const status = document.querySelector('#settings-status');

  if (!form || !delayInput || !sourceSelect || !targetSelect || !status) {
    throw new Error('Markup delle impostazioni incompleto.');
  }

  const settings = await loadSettings(storageArea);
  delayInput.value = String(settings.delayMs);
  fillLanguageSelect(sourceSelect, settings.sourceLanguage);
  fillLanguageSelect(targetSelect, settings.targetLanguage);

  const handleSubmit = async (event) => {
    event.preventDefault();
    status.dataset.state = '';

    const candidate = {
      delayMs: Number(delayInput.value),
      sourceLanguage: sourceSelect.value,
      targetLanguage: targetSelect.value,
    };
    const validation = validateSettings(candidate);
    if (!validation.ok) {
      status.dataset.state = 'error';
      status.textContent = Object.values(validation.errors).join(' ');
      return;
    }

    try {
      await saveSettings(storageArea, validation.value);
      status.dataset.state = 'success';
      status.textContent = 'Impostazioni salvate.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'Impossibile salvare le impostazioni. Riprova.';
    }
  };

  form.addEventListener('submit', handleSubmit);

  return {
    dispose() {
      form.removeEventListener('submit', handleSubmit);
    },
  };
}

if (globalThis.chrome?.storage?.sync && globalThis.document) {
  bindSettingsPopup({
    document: globalThis.document,
    storageArea: globalThis.chrome.storage.sync,
  }).catch(() => {
    const status = globalThis.document.querySelector('#settings-status');
    if (status) {
      status.dataset.state = 'error';
      status.textContent = 'Impossibile caricare le impostazioni.';
    }
  });
}
