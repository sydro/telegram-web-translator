import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPreviewPanel } from '../../src/content/preview-panel.js';

const snapshot = (status, changes = {}) => ({
  status,
  sourceText: 'Ciao',
  translatedText: '',
  progress: null,
  errorCode: null,
  generation: 1,
  ...changes,
});

function createSubject() {
  const onSend = vi.fn();
  const onRetry = vi.fn();
  const panel = createPreviewPanel({ document, onSend, onRetry });
  document.body.append(panel.host);
  return { panel, onSend, onRetry, root: panel.host.shadowRoot };
}

describe('translation preview panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="composer" contenteditable="true" tabindex="0"></div>';
  });

  it.each(['idle', 'waiting'])('stays hidden in the %s state', (status) => {
    const { panel } = createSubject();

    panel.render(snapshot(status));

    expect(panel.host.hidden).toBe(true);
  });

  it('shows language-pack download progress in an aria-live status', () => {
    const { panel, root } = createSubject();

    panel.render(snapshot('preparing', { progress: 0.35 }));

    expect(panel.host.hidden).toBe(false);
    expect(root.querySelector('[aria-live="polite"]').textContent).toContain('35%');
  });

  it('shows an unobtrusive translating indicator', () => {
    const { panel, root } = createSubject();

    panel.render(snapshot('translating'));

    expect(root.querySelector('[data-role="spinner"]')).not.toBeNull();
    expect(root.textContent).toContain('Traduzione');
  });

  it('renders translated text safely and invokes send from a native button', () => {
    const { panel, root, onSend } = createSubject();
    const translatedText = '<img src=x onerror=alert(1)> Hello';

    panel.render(snapshot('ready', { translatedText }));
    const button = root.querySelector('[data-action="send"]');

    expect(root.querySelector('[data-role="translation"]').textContent).toBe(translatedText);
    expect(root.querySelector('img')).toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Invia traduzione');
    button.click();
    expect(onSend).toHaveBeenCalledOnce();
  });

  it.each([
    ['unsupported', 'Chrome 138'],
    ['pair-unavailable', 'coppia di lingue'],
    ['translation-failed', 'Traduzione non disponibile'],
    ['send-failed', 'Invio della traduzione non riuscito'],
  ])('shows Italian copy and retry for %s', (errorCode, expectedCopy) => {
    const { panel, root, onRetry } = createSubject();

    panel.render(snapshot('error', { errorCode }));
    const retry = root.querySelector('[data-action="retry"]');

    expect(root.textContent).toContain(expectedCopy);
    expect(retry.tagName).toBe('BUTTON');
    expect(retry.textContent).toBe('Riprova');
    retry.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('can disable translated sending without changing the preview', () => {
    const { panel, root } = createSubject();
    panel.render(snapshot('ready', { translatedText: 'Hello' }));

    panel.setSendEnabled(false);

    expect(root.querySelector('[data-action="send"]').disabled).toBe(true);
    expect(root.querySelector('[data-role="translation"]').textContent).toBe('Hello');
  });

  it('does not steal focus when it rerenders', () => {
    const { panel } = createSubject();
    const composer = document.querySelector('#composer');
    composer.focus();

    panel.render(snapshot('ready', { translatedText: 'Hello' }));

    expect(document.activeElement).toBe(composer);
  });

  it('removes its host and event listeners when destroyed', () => {
    const { panel, root, onSend } = createSubject();
    panel.render(snapshot('ready', { translatedText: 'Hello' }));
    const sendButton = root.querySelector('[data-action="send"]');

    panel.destroy();
    sendButton.click();

    expect(panel.host.isConnected).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
  });
});
