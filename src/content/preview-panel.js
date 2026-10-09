const ERROR_MESSAGES = {
  unsupported: 'Chrome 138 o versione successiva è necessario per tradurre sul dispositivo.',
  'pair-unavailable': 'Questa coppia di lingue non è disponibile in Chrome.',
  'translation-failed': 'Traduzione non disponibile.',
  'send-failed': 'Invio della traduzione non riuscito. Il testo originale è stato ripristinato.',
};

const STYLES = `
  :host {
    display: block;
    margin: 0 8px 8px;
    color: #17212b;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :host([hidden]) { display: none; }
  * { box-sizing: border-box; }
  .card {
    display: flex;
    gap: 10px;
    align-items: center;
    min-height: 44px;
    padding: 9px 10px 9px 12px;
    border: 1px solid rgb(51 144 236 / 24%);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 4px 18px rgb(15 23 42 / 12%);
  }
  .content { min-width: 0; flex: 1; }
  .eyebrow {
    display: block;
    margin-bottom: 2px;
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .05em;
    text-transform: uppercase;
  }
  .translation { overflow-wrap: anywhere; white-space: pre-wrap; }
  .status, .error { color: #475569; }
  .error { color: #b42318; }
  button {
    flex: none;
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    background: #3390ec;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
  button:hover:not(:disabled) { background: #2783db; }
  button:focus-visible { outline: 3px solid rgb(51 144 236 / 35%); outline-offset: 2px; }
  button:disabled { cursor: wait; opacity: .55; }
  .retry { background: #475569; }
  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 7px;
    border: 2px solid #bfdbfe;
    border-top-color: #3390ec;
    border-radius: 50%;
    vertical-align: -2px;
    animation: spin .8s linear infinite;
  }
  [hidden] { display: none !important; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-color-scheme: dark) {
    :host { color: #f8fafc; }
    .card { border-color: rgb(96 165 250 / 25%); background: #17212b; box-shadow: 0 4px 18px rgb(0 0 0 / 22%); }
    .eyebrow, .status { color: #94a3b8; }
    .error { color: #fda29b; }
  }
`;

export function createPreviewPanel({ document, onSend, onRetry }) {
  const host = document.createElement('telegram-translator-preview');
  host.hidden = true;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="card" aria-live="polite">
      <div class="content">
        <div class="status" data-view="status" hidden></div>
        <div data-view="ready" hidden>
          <span class="eyebrow">Traduzione</span>
          <div class="translation" data-role="translation"></div>
        </div>
        <div class="error" data-view="error" hidden></div>
      </div>
      <button type="button" data-action="send" hidden>Invia traduzione</button>
      <button type="button" class="retry" data-action="retry" hidden>Riprova</button>
    </div>
  `;

  const statusView = shadow.querySelector('[data-view="status"]');
  const readyView = shadow.querySelector('[data-view="ready"]');
  const errorView = shadow.querySelector('[data-view="error"]');
  const translation = shadow.querySelector('[data-role="translation"]');
  const sendButton = shadow.querySelector('[data-action="send"]');
  const retryButton = shadow.querySelector('[data-action="retry"]');

  const handleSend = () => onSend?.();
  const handleRetry = () => onRetry?.();
  sendButton.addEventListener('click', handleSend);
  retryButton.addEventListener('click', handleRetry);

  const hideViews = () => {
    statusView.hidden = true;
    readyView.hidden = true;
    errorView.hidden = true;
    sendButton.hidden = true;
    retryButton.hidden = true;
  };

  return {
    host,

    render(snapshot) {
      hideViews();
      if (snapshot.status === 'idle' || snapshot.status === 'waiting') {
        host.hidden = true;
        return;
      }

      host.hidden = false;
      if (snapshot.status === 'preparing') {
        statusView.hidden = false;
        const percent = Number.isFinite(snapshot.progress)
          ? ` ${Math.round(snapshot.progress * 100)}%`
          : '';
        statusView.textContent = `Preparazione del modello linguistico…${percent}`;
        return;
      }

      if (snapshot.status === 'translating') {
        statusView.hidden = false;
        statusView.replaceChildren();
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.dataset.role = 'spinner';
        spinner.setAttribute('aria-hidden', 'true');
        statusView.append(spinner, document.createTextNode('Traduzione in corso…'));
        return;
      }

      if (snapshot.status === 'ready') {
        readyView.hidden = false;
        sendButton.hidden = false;
        sendButton.disabled = false;
        translation.textContent = snapshot.translatedText;
        return;
      }

      if (snapshot.status === 'error') {
        errorView.hidden = false;
        retryButton.hidden = false;
        errorView.textContent = ERROR_MESSAGES[snapshot.errorCode]
          || 'Traduzione non disponibile.';
      }
    },

    setSendEnabled(enabled) {
      sendButton.disabled = !enabled;
    },

    destroy() {
      sendButton.removeEventListener('click', handleSend);
      retryButton.removeEventListener('click', handleRetry);
      host.remove();
    },
  };
}
