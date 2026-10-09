import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createTelegramAdapter } from '../../src/content/telegram-adapter.js';

const fixture = (name) => readFileSync(resolve('tests/fixtures', name), 'utf8');

describe.each([
  { client: 'Web A', pathname: '/a/', fixtureName: 'telegram-a-composer.html' },
  { client: 'Web K', pathname: '/k/', fixtureName: 'telegram-k-composer.html' },
])('$client Telegram adapter', ({ pathname, fixtureName }) => {
  beforeEach(() => {
    document.body.innerHTML = fixture(fixtureName);
  });

  it('finds the semantic composer, mount target, and send control', () => {
    const adapter = createTelegramAdapter({ document, pathname });

    const context = adapter.findContext();

    expect(context.composer.getAttribute('role')).toBe('textbox');
    expect(context.mountTarget.classList.contains('input-message-container')).toBe(true);
    expect(context.sendButton.tagName).toBe('BUTTON');
  });

  it('reads multiline emoji text without normalization', () => {
    const adapter = createTelegramAdapter({ document, pathname });
    const context = adapter.findContext();

    context.composer.textContent = 'Ciao 👋\nCome va?';

    expect(adapter.readDraft(context)).toBe('Ciao 👋\nCome va?');
  });

  it('replaces draft text and emits bubbling beforeinput and input events', () => {
    const adapter = createTelegramAdapter({ document, pathname });
    const context = adapter.findContext();
    const events = [];
    context.mountTarget.addEventListener('beforeinput', (event) => events.push({
      type: event.type,
      inputType: event.inputType,
      data: event.data,
    }));
    context.mountTarget.addEventListener('input', (event) => events.push({
      type: event.type,
      inputType: event.inputType,
      data: event.data,
    }));

    expect(adapter.replaceDraft(context, 'Hello 👋\nHow are you?')).toBe(true);

    expect(context.composer.textContent).toBe('Hello 👋\nHow are you?');
    expect(events).toEqual([
      { type: 'beforeinput', inputType: 'insertText', data: 'Hello 👋\nHow are you?' },
      { type: 'input', inputType: 'insertText', data: 'Hello 👋\nHow are you?' },
    ]);
  });

  it('clicks the enabled native send control exactly once', () => {
    const adapter = createTelegramAdapter({ document, pathname });
    const context = adapter.findContext();
    const click = vi.spyOn(context.sendButton, 'click');

    expect(adapter.sendNative(context)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('rejects a composer with an attachment', () => {
    const adapter = createTelegramAdapter({ document, pathname });
    const context = adapter.findContext();
    const attachment = document.createElement('button');
    attachment.setAttribute('aria-label', 'Remove attachment');
    context.mountTarget.append(attachment);

    expect(adapter.isEligible(context)).toBe(false);
  });

  it('returns false for a missing or disabled send control', () => {
    const adapter = createTelegramAdapter({ document, pathname });
    const context = adapter.findContext();

    expect(adapter.sendNative({ ...context, sendButton: null })).toBe(false);

    context.sendButton.disabled = true;
    expect(adapter.sendNative(context)).toBe(false);

    context.sendButton.disabled = false;
    context.sendButton.setAttribute('aria-disabled', 'true');
    expect(adapter.sendNative(context)).toBe(false);
  });
});

describe('unsupported Telegram layout', () => {
  it('stays inert outside Web A and Web K paths', () => {
    document.body.innerHTML = '<div contenteditable="true" role="textbox">Ciao</div>';
    const adapter = createTelegramAdapter({ document, pathname: '/z/' });

    expect(adapter.findContext()).toBeNull();
    expect(adapter.readDraft(null)).toBe('');
    expect(adapter.replaceDraft(null, 'Hello')).toBe(false);
    expect(adapter.isEligible(null)).toBe(false);
    expect(adapter.sendNative(null)).toBe(false);
  });
});
