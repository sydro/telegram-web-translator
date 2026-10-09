export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  delayMs: 700,
  sourceLanguage: 'it',
  targetLanguage: 'en',
});

const LANGUAGE_ENTRIES = [
  ['ar', 'Arabo'],
  ['bg', 'Bulgaro'],
  ['bn', 'Bengalese'],
  ['cs', 'Ceco'],
  ['da', 'Danese'],
  ['de', 'Tedesco'],
  ['el', 'Greco'],
  ['en', 'Inglese'],
  ['es', 'Spagnolo'],
  ['fi', 'Finlandese'],
  ['fr', 'Francese'],
  ['he', 'Ebraico'],
  ['hi', 'Hindi'],
  ['hr', 'Croato'],
  ['hu', 'Ungherese'],
  ['id', 'Indonesiano'],
  ['it', 'Italiano'],
  ['ja', 'Giapponese'],
  ['kn', 'Kannada'],
  ['ko', 'Coreano'],
  ['lt', 'Lituano'],
  ['mr', 'Marathi'],
  ['nl', 'Olandese'],
  ['no', 'Norvegese'],
  ['pl', 'Polacco'],
  ['pt', 'Portoghese'],
  ['ro', 'Rumeno'],
  ['ru', 'Russo'],
  ['sk', 'Slovacco'],
  ['sl', 'Sloveno'],
  ['sv', 'Svedese'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['th', 'Thailandese'],
  ['tr', 'Turco'],
  ['uk', 'Ucraino'],
  ['vi', 'Vietnamita'],
  ['zh', 'Cinese semplificato'],
  ['zh-Hant', 'Cinese tradizionale'],
];

export const SUPPORTED_LANGUAGES = Object.freeze(
  LANGUAGE_ENTRIES.map(([code, label]) => Object.freeze({ code, label })),
);

const SUPPORTED_CODES = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

function isValidDelay(delayMs) {
  return Number.isInteger(delayMs)
    && delayMs >= 300
    && delayMs <= 3000
    && delayMs % 100 === 0;
}

export function validateSettings(candidate) {
  const value = candidate && typeof candidate === 'object' ? candidate : {};
  const errors = {};

  if (typeof value.enabled !== 'boolean') {
    errors.enabled = 'Lo stato dell’estensione non è valido.';
  }

  if (!isValidDelay(value.delayMs)) {
    errors.delayMs = 'Inserisci un valore tra 300 e 3000 ms, a intervalli di 100 ms.';
  }

  if (!SUPPORTED_CODES.has(value.sourceLanguage)) {
    errors.sourceLanguage = 'Seleziona una lingua di origine supportata.';
  }

  if (!SUPPORTED_CODES.has(value.targetLanguage)) {
    errors.targetLanguage = 'Seleziona una lingua di destinazione supportata.';
  } else if (value.sourceLanguage === value.targetLanguage) {
    errors.targetLanguage = 'La lingua di destinazione deve essere diversa da quella di origine.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      enabled: value.enabled,
      delayMs: value.delayMs,
      sourceLanguage: value.sourceLanguage,
      targetLanguage: value.targetLanguage,
    },
  };
}

export function normalizeSettings(candidate) {
  const value = candidate && typeof candidate === 'object' ? candidate : {};
  const normalized = {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
    delayMs: isValidDelay(value.delayMs) ? value.delayMs : DEFAULT_SETTINGS.delayMs,
    sourceLanguage: SUPPORTED_CODES.has(value.sourceLanguage)
      ? value.sourceLanguage
      : DEFAULT_SETTINGS.sourceLanguage,
    targetLanguage: SUPPORTED_CODES.has(value.targetLanguage)
      ? value.targetLanguage
      : DEFAULT_SETTINGS.targetLanguage,
  };

  if (normalized.sourceLanguage === normalized.targetLanguage) {
    normalized.sourceLanguage = DEFAULT_SETTINGS.sourceLanguage;
    normalized.targetLanguage = DEFAULT_SETTINGS.targetLanguage;
  }

  return normalized;
}

export async function loadSettings(storageArea) {
  const stored = await storageArea.get('settings');
  return normalizeSettings(stored?.settings);
}

export async function saveSettings(storageArea, settings) {
  const result = validateSettings(settings);
  if (!result.ok) {
    return result;
  }

  await storageArea.set({ settings: result.value });
  return result;
}
