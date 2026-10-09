const CLIENTS = {
  a: {
    root: '#MiddleColumn',
    mountSelectors: [
      '.message-input-wrapper',
      '[data-telegram-composer]',
      '.input-message-container',
    ],
    composerSelectors: [
      '.input-message-input[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"][contenteditable]:not([contenteditable="false"])',
      '[data-placeholder][contenteditable]:not([contenteditable="false"])',
    ],
  },
  k: {
    root: '#column-center',
    mountSelectors: [
      '.chat-input-container.chat-input-main-container',
      '.chat-input-main-container',
      '.chat-input-container',
      '.chat-input',
      '[data-telegram-composer]',
      '.input-message-container',
    ],
    composerSelectors: [
      '.input-message-input[contenteditable]:not([contenteditable="false"])',
      '[role="textbox"][contenteditable]:not([contenteditable="false"])',
      '[data-placeholder][contenteditable]:not([contenteditable="false"])',
    ],
  },
};

const SEND_SELECTOR = [
  'button[aria-label*="send" i]',
  'button[aria-label*="invia" i]',
  'button[data-testid*="send" i]',
  'button.btn-send',
  'button.send-button',
].join(',');

const ATTACHMENT_SELECTOR = [
  '[aria-label*="remove attachment" i]',
  '[aria-label*="rimuovi allegato" i]',
  '[data-testid*="attachment" i]',
  '.media-editor-container',
  '.attachment-preview',
].join(',');

function clientFromPath(pathname) {
  if (pathname === '/a' || pathname.startsWith('/a/')) return CLIENTS.a;
  if (pathname === '/k' || pathname.startsWith('/k/')) return CLIENTS.k;
  return null;
}

function isUsableElement(element) {
  return element
    && !element.closest('[hidden], [aria-hidden="true"]')
    && element.getAttribute('contenteditable') !== 'false';
}

function findFirst(root, selectors) {
  for (const selector of selectors) {
    const match = [...root.querySelectorAll(selector)].find(isUsableElement);
    if (match) return match;
  }
  return null;
}

function findPreferredAncestor(element, selectors) {
  for (const selector of selectors) {
    const match = element.closest(selector);
    if (match) return match;
  }
  return element.parentElement;
}

function createInputEvent(document, type, text) {
  return new document.defaultView.InputEvent(type, {
    bubbles: true,
    cancelable: type === 'beforeinput',
    composed: true,
    data: text,
    inputType: 'insertText',
  });
}

export function createTelegramAdapter({ document, pathname }) {
  const client = clientFromPath(pathname);

  return {
    findContext() {
      if (!client) return null;
      const root = document.querySelector(client.root);
      if (!root) return null;

      const composer = findFirst(root, client.composerSelectors);
      if (!composer) return null;

      const mountTarget = findPreferredAncestor(composer, client.mountSelectors);
      if (!mountTarget) return null;
      const sendScope = mountTarget.parentElement || mountTarget;
      const sendButton = mountTarget.querySelector(SEND_SELECTOR)
        || sendScope.querySelector(SEND_SELECTOR);

      return { composer, mountTarget, sendButton };
    },

    readDraft(context) {
      if (!context?.composer) return '';
      return typeof context.composer.innerText === 'string'
        ? context.composer.innerText
        : context.composer.textContent || '';
    },

    replaceDraft(context, text) {
      if (!context?.composer) return false;
      try {
        const value = String(text);
        const beforeInput = createInputEvent(document, 'beforeinput', value);
        if (!context.composer.dispatchEvent(beforeInput)) return false;
        context.composer.textContent = value;
        context.composer.dispatchEvent(createInputEvent(document, 'input', value));
        return true;
      } catch {
        return false;
      }
    },

    isEligible(context) {
      if (!context?.composer || !context.mountTarget) return false;
      const scope = context.mountTarget.parentElement || context.mountTarget;
      const hasAttachment = context.mountTarget.querySelector(ATTACHMENT_SELECTOR)
        || scope.querySelector(ATTACHMENT_SELECTOR);
      const draft = typeof context.composer.innerText === 'string'
        ? context.composer.innerText
        : context.composer.textContent || '';
      return draft.trim().length > 0 && !hasAttachment;
    },

    sendNative(context) {
      const button = context?.sendButton;
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') {
        return false;
      }
      try {
        button.click();
        return true;
      } catch {
        return false;
      }
    },
  };
}
