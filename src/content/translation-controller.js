function samePair(left, right) {
  return left.sourceLanguage === right.sourceLanguage
    && left.targetLanguage === right.targetLanguage;
}

export function createTranslationController({
  translatorApi,
  initialSettings,
  onStateChange,
  timers = globalThis,
}) {
  let settings = { ...initialSettings };
  let generation = 0;
  let timerId = null;
  let translator = null;
  let translatorPair = null;
  let disposed = false;
  let snapshot = {
    status: 'idle',
    sourceText: '',
    translatedText: '',
    progress: null,
    errorCode: null,
    generation,
  };

  const emit = (changes) => {
    snapshot = { ...snapshot, ...changes, generation };
    onStateChange?.({ ...snapshot });
  };

  const clearPendingTimer = () => {
    if (timerId !== null) {
      timers.clearTimeout(timerId);
      timerId = null;
    }
  };

  const isCurrent = (capturedGeneration, sourceText, pair) => (
    !disposed
    && generation === capturedGeneration
    && snapshot.sourceText === sourceText
    && samePair(settings, pair)
  );

  const destroyTranslator = () => {
    translator?.destroy?.();
    translator = null;
    translatorPair = null;
  };

  const getTranslator = async (capturedGeneration, sourceText, pair) => {
    if (translator && translatorPair && samePair(translatorPair, pair)) {
      return translator;
    }

    emit({ status: 'preparing', translatedText: '', progress: null, errorCode: null });
    const availability = await translatorApi.availability({
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
    });

    if (!isCurrent(capturedGeneration, sourceText, pair)) {
      return null;
    }
    if (availability === 'unavailable') {
      emit({ status: 'error', progress: null, errorCode: 'pair-unavailable' });
      return null;
    }

    const created = await translatorApi.create({
      sourceLanguage: pair.sourceLanguage,
      targetLanguage: pair.targetLanguage,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          if (isCurrent(capturedGeneration, sourceText, pair)) {
            emit({ status: 'preparing', progress: event.loaded });
          }
        });
      },
    });

    if (!isCurrent(capturedGeneration, sourceText, pair)) {
      created?.destroy?.();
      return null;
    }

    translator = created;
    translatorPair = { ...pair };
    return translator;
  };

  const translateCurrentGeneration = async (capturedGeneration, sourceText, pair) => {
    if (!translatorApi?.availability || !translatorApi?.create) {
      if (isCurrent(capturedGeneration, sourceText, pair)) {
        emit({ status: 'error', translatedText: '', progress: null, errorCode: 'unsupported' });
      }
      return;
    }

    try {
      const activeTranslator = await getTranslator(capturedGeneration, sourceText, pair);
      if (!activeTranslator || !isCurrent(capturedGeneration, sourceText, pair)) {
        return;
      }

      emit({ status: 'translating', translatedText: '', progress: null, errorCode: null });
      const translatedText = await activeTranslator.translate(sourceText);
      if (isCurrent(capturedGeneration, sourceText, pair)) {
        emit({ status: 'ready', translatedText, progress: null, errorCode: null });
      }
    } catch {
      if (isCurrent(capturedGeneration, sourceText, pair)) {
        emit({ status: 'error', translatedText: '', progress: null, errorCode: 'translation-failed' });
      }
    }
  };

  const scheduleCurrentDraft = () => {
    clearPendingTimer();
    const sourceText = snapshot.sourceText;
    if (!sourceText.trim()) {
      emit({ status: 'idle', sourceText: '', translatedText: '', progress: null, errorCode: null });
      return;
    }

    const capturedGeneration = generation;
    const pair = {
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
    };
    emit({ status: 'waiting', translatedText: '', progress: null, errorCode: null });
    timerId = timers.setTimeout(() => {
      timerId = null;
      void translateCurrentGeneration(capturedGeneration, sourceText, pair);
    }, settings.delayMs);
  };

  return {
    updateDraft(text) {
      if (disposed) return;
      generation += 1;
      clearPendingTimer();
      snapshot = { ...snapshot, sourceText: String(text), generation };
      scheduleCurrentDraft();
    },

    updateSettings(nextSettings) {
      if (disposed) return;
      generation += 1;
      clearPendingTimer();
      const pairChanged = !samePair(settings, nextSettings);
      settings = { ...nextSettings };
      if (pairChanged) {
        destroyTranslator();
      }
      snapshot = { ...snapshot, generation };
      scheduleCurrentDraft();
    },

    retry() {
      if (disposed) return;
      generation += 1;
      snapshot = { ...snapshot, generation };
      scheduleCurrentDraft();
    },

    getSnapshot() {
      return { ...snapshot };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearPendingTimer();
      destroyTranslator();
    },
  };
}
