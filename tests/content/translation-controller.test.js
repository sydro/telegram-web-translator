import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTranslationController } from '../../src/content/translation-controller.js';

const INITIAL_SETTINGS = {
  delayMs: 700,
  sourceLanguage: 'it',
  targetLanguage: 'en',
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createTranslator(translate = async (text) => `EN:${text}`) {
  return {
    translate: vi.fn(translate),
    destroy: vi.fn(),
  };
}

function createApi({ availability = 'available', translator = createTranslator(), onMonitor } = {}) {
  return {
    availability: vi.fn().mockResolvedValue(availability),
    create: vi.fn().mockImplementation(async (options) => {
      if (options.monitor) {
        const monitor = new EventTarget();
        options.monitor(monitor);
        onMonitor?.(monitor);
      }
      return translator;
    }),
  };
}

function createSubject(api, settings = INITIAL_SETTINGS) {
  const snapshots = [];
  const controller = createTranslationController({
    translatorApi: api,
    initialSettings: settings,
    onStateChange: (snapshot) => snapshots.push(snapshot),
  });
  return { controller, snapshots };
}

describe('translation controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the configured quiet period before translating', async () => {
    const translator = createTranslator();
    const api = createApi({ translator });
    const { controller } = createSubject(api);

    controller.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(699);
    expect(translator.translate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      sourceText: 'Ciao',
      translatedText: 'EN:Ciao',
    });
  });

  it('keeps whitespace idle and preserves emoji and newlines exactly', async () => {
    const translator = createTranslator();
    const api = createApi({ translator });
    const { controller } = createSubject(api);

    controller.updateDraft('  \n ');
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot().status).toBe('idle');

    controller.updateDraft('Ciao 👋\nCome va?');
    await vi.advanceTimersByTimeAsync(700);
    expect(translator.translate).toHaveBeenCalledWith('Ciao 👋\nCome va?');
    expect(controller.getSnapshot().translatedText).toBe('EN:Ciao 👋\nCome va?');
  });

  it('reports language-pack download progress before translating', async () => {
    const api = createApi({
      availability: 'downloadable',
      onMonitor(monitor) {
        const progress = new Event('downloadprogress');
        Object.defineProperty(progress, 'loaded', { value: 0.35 });
        monitor.dispatchEvent(progress);
      },
    });
    const { controller, snapshots } = createSubject(api);

    controller.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);

    expect(snapshots).toContainEqual(expect.objectContaining({
      status: 'preparing',
      progress: 0.35,
    }));
    expect(controller.getSnapshot().status).toBe('ready');
  });

  it('reuses a translator for multiple drafts in the same language pair', async () => {
    const api = createApi();
    const { controller } = createSubject(api);

    controller.updateDraft('Uno');
    await vi.advanceTimersByTimeAsync(700);
    controller.updateDraft('Due');
    await vi.advanceTimersByTimeAsync(700);

    expect(api.create).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().translatedText).toBe('EN:Due');
  });

  it('destroys the old translator and retranslates after a language-pair change', async () => {
    const firstTranslator = createTranslator(async (text) => `EN:${text}`);
    const secondTranslator = createTranslator(async (text) => `FR:${text}`);
    const api = createApi({ translator: firstTranslator });
    api.create
      .mockImplementationOnce(async () => firstTranslator)
      .mockImplementationOnce(async () => secondTranslator);
    const { controller } = createSubject(api);

    controller.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    controller.updateSettings({ ...INITIAL_SETTINGS, targetLanguage: 'fr' });
    await vi.advanceTimersByTimeAsync(700);

    expect(firstTranslator.destroy).toHaveBeenCalledOnce();
    expect(api.create).toHaveBeenLastCalledWith(expect.objectContaining({
      sourceLanguage: 'it',
      targetLanguage: 'fr',
    }));
    expect(controller.getSnapshot().translatedText).toBe('FR:Ciao');
  });

  it('maps missing API and unavailable pairs to stable error codes', async () => {
    const unsupported = createSubject(undefined).controller;
    unsupported.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    expect(unsupported.getSnapshot()).toMatchObject({ status: 'error', errorCode: 'unsupported' });

    const unavailable = createSubject(createApi({ availability: 'unavailable' })).controller;
    unavailable.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    expect(unavailable.getSnapshot()).toMatchObject({ status: 'error', errorCode: 'pair-unavailable' });
  });

  it('maps translator creation and translation failures without throwing', async () => {
    const creationApi = createApi();
    creationApi.create.mockRejectedValue(new Error('download failed'));
    const creationFailure = createSubject(creationApi).controller;
    creationFailure.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    expect(creationFailure.getSnapshot()).toMatchObject({ status: 'error', errorCode: 'translation-failed' });

    const translator = createTranslator(async () => { throw new Error('translate failed'); });
    const translationFailure = createSubject(createApi({ translator })).controller;
    translationFailure.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    expect(translationFailure.getSnapshot()).toMatchObject({ status: 'error', errorCode: 'translation-failed' });
  });

  it('discards an older translation after the draft changes', async () => {
    const oldResult = deferred();
    const translator = createTranslator((text) => (
      text === 'Vecchio' ? oldResult.promise : Promise.resolve(`EN:${text}`)
    ));
    const { controller } = createSubject(createApi({ translator }));

    controller.updateDraft('Vecchio');
    await vi.advanceTimersByTimeAsync(700);
    controller.updateDraft('Nuovo');
    await vi.advanceTimersByTimeAsync(700);
    oldResult.resolve('EN:Vecchio');
    await Promise.resolve();

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      sourceText: 'Nuovo',
      translatedText: 'EN:Nuovo',
    });
  });

  it('discards an older translation after languages change', async () => {
    const oldResult = deferred();
    const firstTranslator = createTranslator(() => oldResult.promise);
    const secondTranslator = createTranslator(async (text) => `FR:${text}`);
    const api = createApi();
    api.create
      .mockResolvedValueOnce(firstTranslator)
      .mockResolvedValueOnce(secondTranslator);
    const { controller } = createSubject(api);

    controller.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);
    controller.updateSettings({ ...INITIAL_SETTINGS, targetLanguage: 'fr' });
    await vi.advanceTimersByTimeAsync(700);
    oldResult.resolve('EN:Ciao');
    await Promise.resolve();

    expect(controller.getSnapshot().translatedText).toBe('FR:Ciao');
  });

  it('retries the current draft and disposes timers and translator resources', async () => {
    const translator = createTranslator();
    const { controller } = createSubject(createApi({ translator }));
    controller.updateDraft('Ciao');
    await vi.advanceTimersByTimeAsync(700);

    controller.retry();
    expect(controller.getSnapshot().status).toBe('waiting');
    await vi.advanceTimersByTimeAsync(700);
    expect(translator.translate).toHaveBeenCalledTimes(2);

    controller.updateDraft('Non tradurre');
    controller.dispose();
    await vi.advanceTimersByTimeAsync(700);
    expect(translator.translate).toHaveBeenCalledTimes(2);
    expect(translator.destroy).toHaveBeenCalledOnce();
  });
});
