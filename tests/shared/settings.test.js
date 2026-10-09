import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  SUPPORTED_LANGUAGES,
  loadSettings,
  normalizeSettings,
  saveSettings,
  validateSettings,
} from '../../src/shared/settings.js';

describe('translation settings', () => {
  it('offers the 39 documented languages with unique codes and Italian labels', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(39);
    expect(new Set(SUPPORTED_LANGUAGES.map(({ code }) => code)).size).toBe(39);
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'it', label: 'Italiano' });
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'en', label: 'Inglese' });
    expect(SUPPORTED_LANGUAGES).toContainEqual({ code: 'zh-Hant', label: 'Cinese tradizionale' });
    expect(SUPPORTED_LANGUAGES.every(({ label }) => label.length > 0)).toBe(true);
  });

  it('uses the exact product defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      delayMs: 700,
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });
  });

  it.each([300, 700, 3000])('accepts a valid delay of %i ms', (delayMs) => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, delayMs })).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, delayMs },
    });
  });

  it.each([299, 350, 3001, 700.5, '700', null])('rejects invalid delay %s', (delayMs) => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, delayMs });

    expect(result.ok).toBe(false);
    expect(result.errors.delayMs).toBeTruthy();
  });

  it('rejects unknown and identical language selections', () => {
    const unknown = validateSettings({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'xx',
      targetLanguage: 'yy',
    });
    const identical = validateSettings({
      ...DEFAULT_SETTINGS,
      sourceLanguage: 'fr',
      targetLanguage: 'fr',
    });

    expect(unknown).toMatchObject({
      ok: false,
      errors: { sourceLanguage: expect.any(String), targetLanguage: expect.any(String) },
    });
    expect(identical).toMatchObject({
      ok: false,
      errors: { targetLanguage: expect.any(String) },
    });
  });

  it('normalizes each valid field independently', () => {
    expect(normalizeSettings({
      delayMs: 1200,
      sourceLanguage: 'fr',
      targetLanguage: 'not-a-language',
    })).toEqual({
      delayMs: 1200,
      sourceLanguage: 'fr',
      targetLanguage: 'en',
    });
  });

  it('restores the default pair when independent fallbacks become identical', () => {
    expect(normalizeSettings({
      delayMs: 900,
      sourceLanguage: 'en',
      targetLanguage: 'not-a-language',
    })).toEqual({
      delayMs: 900,
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });
  });

  it('loads and normalizes settings from the single storage key', async () => {
    const storageArea = {
      get: vi.fn().mockResolvedValue({
        settings: { delayMs: 1000, sourceLanguage: 'de', targetLanguage: 'fr' },
      }),
    };

    await expect(loadSettings(storageArea)).resolves.toEqual({
      delayMs: 1000,
      sourceLanguage: 'de',
      targetLanguage: 'fr',
    });
    expect(storageArea.get).toHaveBeenCalledWith('settings');
  });

  it('saves valid settings and does not write invalid settings', async () => {
    const storageArea = { set: vi.fn().mockResolvedValue(undefined) };
    const valid = { delayMs: 800, sourceLanguage: 'es', targetLanguage: 'de' };

    await expect(saveSettings(storageArea, valid)).resolves.toEqual({ ok: true, value: valid });
    expect(storageArea.set).toHaveBeenCalledWith({ settings: valid });

    storageArea.set.mockClear();
    const invalidResult = await saveSettings(storageArea, {
      delayMs: 800,
      sourceLanguage: 'de',
      targetLanguage: 'de',
    });
    expect(invalidResult.ok).toBe(false);
    expect(storageArea.set).not.toHaveBeenCalled();
  });
});
