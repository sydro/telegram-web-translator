import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTelegramTranslator } from '../../src/content/app.js';

const WEB_A_FIXTURE = readFileSync(resolve('tests/fixtures/telegram-a-composer.html'), 'utf8');
const DEFAULTS = { delayMs: 700, sourceLanguage: 'it', targetLanguage: 'en' };

function createStorage(initialSettings = DEFAULTS) {
  let settings = initialSettings;
  const listeners = new Set();
  return {
    get: vi.fn(async () => ({ settings })),
    set: vi.fn(async ({ settings: nextSettings }) => { settings = nextSettings; }),
    onChanged: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
    },
    emit(nextSettings) {
      const oldValue = settings;
      settings = nextSettings;
      for (const listener of listeners) {
        listener({ settings: { oldValue, newValue: nextSettings } }, 'sync');
      }
    },
    listenerCount() { return listeners.size; },
  };
}

function createTranslatorApi() {
  return {
    availability: vi.fn().mockResolvedValue('available'),
    create: vi.fn(async ({ targetLanguage }) => ({
      translate: vi.fn(async (text) => `${targetLanguage.toUpperCase()}:${text}`),
      destroy: vi.fn(),
    })),
  };
}

function composer() {
  return document.querySelector('[contenteditable="true"]');
}

function panel() {
  return document.querySelector('telegram-translator-preview');
}

function extensionSendButton() {
  return panel().shadowRoot.querySelector('[data-action="send"]');
}

function nativeSendButton() {
  return document.querySelector('button[aria-label="Send Message"]');
}

function typeDraft(text) {
  composer().textContent = text;
  composer().dispatchEvent(new InputEvent('input', {
    bubbles: true,
    data: text,
    inputType: 'insertText',
  }));
}

async function flushDom() {
  await Promise.resolve();
  await Promise.resolve();
}

async function revealTranslation(delayMs = 700) {
  await vi.advanceTimersByTimeAsync(delayMs);
  await flushDom();
}

describe('Telegram translator content application', () => {
  let application;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = WEB_A_FIXTURE;
  });

  afterEach(() => {
    application?.dispose();
    application = undefined;
    vi.useRealTimers();
  });

  async function start({ storageArea = createStorage(), translatorApi = createTranslatorApi() } = {}) {
    application = await startTelegramTranslator({
      document,
      location: { pathname: '/a/' },
      storageArea,
      translatorApi,
    });
    await flushDom();
    return { storageArea, translatorApi };
  }

  it('keeps exactly one panel mounted when Telegram replaces the composer', async () => {
    await start();
    const oldPanel = panel();
    expect(document.querySelectorAll('telegram-translator-preview')).toHaveLength(1);

    document.body.innerHTML = WEB_A_FIXTURE;
    await flushDom();

    expect(document.querySelectorAll('telegram-translator-preview')).toHaveLength(1);
    expect(panel()).not.toBe(oldPanel);
    expect(oldPanel.isConnected).toBe(false);
  });

  it('mounts the translation panel outside and immediately above the whole composer wrapper', async () => {
    await start();
    const composerWrapper = document.querySelector('.message-input-wrapper');

    expect(panel().parentElement).toBe(composerWrapper.parentElement);
    expect(panel().nextElementSibling).toBe(composerWrapper);
  });

  it('translates composer input after the configured delay', async () => {
    await start();

    typeDraft('Ciao');
    await revealTranslation();

    expect(panel().shadowRoot.querySelector('[data-role="translation"]').textContent).toBe('EN:Ciao');
    expect(panel().hidden).toBe(false);
  });

  it('waits for compositionend before debouncing IME input', async () => {
    composer().textContent = '';
    const { translatorApi } = await start();
    composer().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    typeDraft('こ');

    await revealTranslation(1000);
    expect(translatorApi.create).not.toHaveBeenCalled();

    composer().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await revealTranslation();
    expect(panel().shadowRoot.querySelector('[data-role="translation"]').textContent).toBe('EN:こ');
  });

  it('applies live delay and language changes and removes a stale preview', async () => {
    const storageArea = createStorage();
    await start({ storageArea });
    typeDraft('Ciao');
    await revealTranslation();
    expect(panel().hidden).toBe(false);

    storageArea.emit({ delayMs: 1200, sourceLanguage: 'it', targetLanguage: 'fr' });
    expect(panel().hidden).toBe(true);
    await revealTranslation(1199);
    expect(panel().hidden).toBe(true);
    await revealTranslation(1);

    expect(panel().shadowRoot.querySelector('[data-role="translation"]').textContent).toBe('FR:Ciao');
  });

  it('hides the previous preview as soon as the source draft changes', async () => {
    await start();
    typeDraft('Prima');
    await revealTranslation();

    typeDraft('Dopo');

    expect(panel().hidden).toBe(true);
  });

  it('refuses translated sending if the source changed without an input event', async () => {
    await start();
    typeDraft('Ciao');
    await revealTranslation();
    const nativeClick = vi.spyOn(nativeSendButton(), 'click');
    composer().textContent = 'Testo cambiato';

    extensionSendButton().click();

    expect(nativeClick).not.toHaveBeenCalled();
    expect(composer().textContent).toBe('Testo cambiato');
    expect(panel().hidden).toBe(true);
  });

  it('sends exactly the displayed translation through Telegram native send', async () => {
    await start();
    typeDraft('Ciao');
    await revealTranslation();
    const sentDrafts = [];
    nativeSendButton().addEventListener('click', () => sentDrafts.push(composer().textContent));

    extensionSendButton().click();

    expect(sentDrafts).toEqual(['EN:Ciao']);
    expect(panel().hidden).toBe(true);
  });

  it('restores the original draft when native sending fails', async () => {
    await start();
    typeDraft('Ciao');
    await revealTranslation();
    nativeSendButton().disabled = true;

    extensionSendButton().click();

    expect(composer().textContent).toBe('Ciao');
    expect(panel().shadowRoot.textContent).toContain('Invio della traduzione non riuscito');
  });

  it('does not mutate or send a draft when an attachment appears', async () => {
    await start();
    typeDraft('Ciao');
    await revealTranslation();
    const attachment = document.createElement('button');
    attachment.setAttribute('aria-label', 'Remove attachment');
    composer().parentElement.append(attachment);
    const nativeClick = vi.spyOn(nativeSendButton(), 'click');

    extensionSendButton().click();

    expect(nativeClick).not.toHaveBeenCalled();
    expect(composer().textContent).toBe('Ciao');
  });

  it('prevents a second translated send from the same preview', async () => {
    await start();
    typeDraft('Ciao');
    await revealTranslation();
    const nativeClick = vi.spyOn(nativeSendButton(), 'click');
    const translateButton = extensionSendButton();

    translateButton.click();
    translateButton.click();

    expect(nativeClick).toHaveBeenCalledOnce();
  });

  it('does not intercept native Enter or Telegram send clicks', async () => {
    await start();
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const nativeClick = vi.fn();
    nativeSendButton().addEventListener('click', nativeClick);

    const dispatched = composer().dispatchEvent(event);
    nativeSendButton().click();

    expect(dispatched).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(nativeClick).toHaveBeenCalledOnce();
  });

  it('removes observers, storage listeners, composer listeners, and panel on dispose', async () => {
    const storageArea = createStorage();
    const { translatorApi } = await start({ storageArea });
    expect(storageArea.listenerCount()).toBe(1);

    application.dispose();
    application = undefined;
    typeDraft('Non tradurre');
    storageArea.emit({ delayMs: 300, sourceLanguage: 'it', targetLanguage: 'fr' });
    await revealTranslation(1000);

    expect(document.querySelector('telegram-translator-preview')).toBeNull();
    expect(storageArea.listenerCount()).toBe(0);
    expect(translatorApi.create).not.toHaveBeenCalled();
  });
});
