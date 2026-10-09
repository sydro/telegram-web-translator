import { loadSettings, normalizeSettings } from '../shared/settings.js';
import { createPreviewPanel } from './preview-panel.js';
import { createTelegramAdapter } from './telegram-adapter.js';
import { createTranslationController } from './translation-controller.js';

export async function startTelegramTranslator({
  document,
  location,
  storageArea,
  translatorApi,
  MutationObserverClass = document.defaultView.MutationObserver,
}) {
  let settings = await loadSettings(storageArea);
  const adapter = createTelegramAdapter({ document, pathname: location.pathname });
  let context = null;
  let panel = null;
  let composing = false;
  let mutatingComposer = false;
  let sendInProgress = false;
  let discoveryQueued = false;
  let disposed = false;

  const controller = createTranslationController({
    translatorApi,
    initialSettings: settings,
    onStateChange(snapshot) {
      panel?.render(snapshot);
    },
  });

  const removeComposerListeners = () => {
    if (!context) return;
    context.composer.removeEventListener('input', handleInput);
    context.composer.removeEventListener('compositionstart', handleCompositionStart);
    context.composer.removeEventListener('compositionend', handleCompositionEnd);
  };

  const showSendError = () => {
    const current = controller.getSnapshot();
    panel?.render({ ...current, status: 'error', errorCode: 'send-failed' });
  };

  const handleTranslatedSend = () => {
    if (disposed || sendInProgress || !context) return;
    const currentSnapshot = controller.getSnapshot();
    if (currentSnapshot.status !== 'ready') return;

    const currentDraft = adapter.readDraft(context);
    if (currentDraft !== currentSnapshot.sourceText) {
      controller.updateDraft(currentDraft);
      return;
    }
    if (!adapter.isEligible(context)) {
      showSendError();
      return;
    }

    sendInProgress = true;
    panel?.setSendEnabled(false);
    mutatingComposer = true;
    try {
      const replaced = adapter.replaceDraft(context, currentSnapshot.translatedText);
      if (!replaced) {
        showSendError();
        return;
      }

      if (!adapter.sendNative(context)) {
        adapter.replaceDraft(context, currentDraft);
        showSendError();
        return;
      }

      controller.updateDraft('');
    } finally {
      mutatingComposer = false;
      sendInProgress = false;
    }
  };

  const handleRetry = () => {
    controller.retry();
  };

  function handleInput() {
    if (mutatingComposer || composing || !context) return;
    controller.updateDraft(adapter.readDraft(context));
  }

  function handleCompositionStart() {
    composing = true;
  }

  function handleCompositionEnd() {
    composing = false;
    handleInput();
  }

  const mountContext = (nextContext) => {
    if (context?.composer === nextContext?.composer && panel?.host.isConnected) {
      context = nextContext;
      return;
    }

    removeComposerListeners();
    panel?.destroy();
    context = nextContext;
    panel = null;
    composing = false;

    if (!context) return;
    panel = createPreviewPanel({
      document,
      onSend: handleTranslatedSend,
      onRetry: handleRetry,
    });
    context.mountTarget.before(panel.host);
    context.composer.addEventListener('input', handleInput);
    context.composer.addEventListener('compositionstart', handleCompositionStart);
    context.composer.addEventListener('compositionend', handleCompositionEnd);
    controller.updateDraft(adapter.readDraft(context));
  };

  const discover = () => {
    discoveryQueued = false;
    if (disposed) return;
    if (!settings.enabled) {
      mountContext(null);
      return;
    }
    mountContext(adapter.findContext());
  };

  const queueDiscovery = () => {
    if (disposed || discoveryQueued) return;
    discoveryQueued = true;
    queueMicrotask(discover);
  };

  const observer = new MutationObserverClass(queueDiscovery);
  observer.observe(document.body, { childList: true, subtree: true });
  discover();

  const handleStorageChange = (changes, areaName) => {
    if (disposed || areaName !== 'sync' || !changes.settings) return;
    settings = normalizeSettings(changes.settings.newValue);
    controller.updateSettings(settings);
    if (!settings.enabled) {
      controller.updateDraft('');
      mountContext(null);
      return;
    }
    discover();
  };
  storageArea.onChanged?.addListener(handleStorageChange);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      storageArea.onChanged?.removeListener(handleStorageChange);
      removeComposerListeners();
      panel?.destroy();
      panel = null;
      context = null;
      controller.dispose();
    },
  };
}
