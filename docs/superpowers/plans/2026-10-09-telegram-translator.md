# Telegram Web Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that previews an on-device translation after a configurable pause and sends it only through a dedicated button, while preserving Telegram's native sending behavior.

**Architecture:** An MV3 content-script application composes a Telegram DOM adapter, a race-safe translation controller, and a Shadow DOM preview panel. A separate action popup edits validated settings in `chrome.storage.sync`; esbuild bundles the extension into a loadable `dist/` directory while Vitest and jsdom exercise the source modules.

**Tech Stack:** JavaScript ES modules, Chrome Manifest V3 and Translator API, `chrome.storage.sync`, Shadow DOM, esbuild, Vitest, jsdom.

**Spec:** `docs/superpowers/specs/2026-10-09-telegram-translator-design.md`

## Global Constraints

- Support Chrome desktop 138 or later and only `https://web.telegram.org/a/*` and `https://web.telegram.org/k/*`.
- Use Chrome's on-device `Translator` API; no backend, remote scripts, translation API keys, telemetry, or draft logging/storage.
- Default settings are `{ delayMs: 700, sourceLanguage: "it", targetLanguage: "en" }`; delay range is 300–3000 ms in 100 ms increments.
- Source and target are user-selectable from the 39-language catalog in the spec and must differ.
- Enter and Telegram's send control remain untouched and send the original draft; only **Invia traduzione** sends translated text.
- Limit translated sending to eligible plain-text drafts without attachments or special Telegram send modes.
- Keep production code framework-free and request only the `storage` permission plus the two Telegram content-script match patterns.
- Build artifacts go in `dist/` and are generated, not hand-edited.

## Review Focus

- IME composition: do not debounce or translate a partially composed character; translate only after `compositionend` plus the configured delay (Task 6).
- Rapid settings changes: a result from the previous language pair must never appear or become sendable (Tasks 3 and 6).
- Whitespace, emoji, and multiline drafts: whitespace stays hidden, while Unicode and newlines reach the translator and Telegram unchanged (Tasks 3 and 4).
- Telegram DOM churn: switching chats or replacing the composer must leave exactly one mounted panel and one active observer path (Task 6).
- Unsafe send state: attachments, a changed source draft, a missing/disabled send control, or a failed native click must not lose the original draft (Tasks 4 and 6).

---

## File map

- `package.json` — build/test commands and development dependencies.
- `vitest.config.js` — jsdom test environment and test discovery.
- `scripts/build.mjs` — clean build of bundles and static extension assets.
- `scripts/verify-dist.mjs` — structural validation of the unpacked extension.
- `src/shared/settings.js` — language catalog, defaults, validation, normalization, and Chrome storage access.
- `src/popup/index.html`, `popup.js`, `popup.css` — action popup settings interface.
- `src/content/translation-controller.js` — debounce, Translator lifecycle, state, progress, and stale-result suppression.
- `src/content/telegram-adapter.js` — Web A/K composer discovery, draft mutation, eligibility, and native send activation.
- `src/content/preview-panel.js` — isolated Shadow DOM status/preview UI.
- `src/content/app.js` — event wiring, settings changes, composer remounts, and translated-send transaction.
- `src/content/index.js` — browser entry point.
- `src/manifest.json` — MV3 metadata, minimum version, content matches, popup, permission, and icons.
- `src/icons/telegram-translator.svg`, `icon-{16,32,48,128}.png` — source artwork and Chrome raster icons.
- `tests/**/*.test.js`, `tests/fixtures/*.html` — unit and DOM integration coverage.
- `README.md` — build, installation, compatibility, privacy, and manual checks.

### Task 1: Project foundation and shared settings

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`
- Create: `src/shared/settings.js`
- Test: `tests/shared/settings.test.js`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS`, `SUPPORTED_LANGUAGES`, `validateSettings(candidate)`, `normalizeSettings(candidate)`, `loadSettings(storageArea)`, and `saveSettings(storageArea, settings)`.
- Types: `Settings = { delayMs: number, sourceLanguage: string, targetLanguage: string }`; validation returns `{ ok: true, value: Settings }` or `{ ok: false, errors: Record<string,string> }`.

- [ ] **Step 1: Add test tooling and the failing settings tests**

  Create `package.json` with `test`, `build`, and `verify:dist` scripts, add esbuild, Vitest, and jsdom as development dependencies, configure jsdom in `vitest.config.js`, and ignore `node_modules/`, `dist/`, and coverage output. Then assert all 39 unique codes and Italian display labels, exact defaults, delay boundaries/step, known and distinct language codes, per-field normalization fallback, storage read/write calls, and rejection of an identical pair.

- [ ] **Step 2: Run the focused tests and confirm the expected failure**

  Run: `npm install && npm test -- tests/shared/settings.test.js`

  Expected: FAIL because `src/shared/settings.js` does not exist.

- [ ] **Step 3: Implement the settings module and test tooling**

  Use a frozen catalog of `{ code, label }` entries from the spec. `normalizeSettings()` must preserve each valid field independently, then restore the full default pair if normalization would make source and target identical. Storage helpers use the single key `settings`.

- [ ] **Step 4: Run the focused tests**

  Run: `npm test -- tests/shared/settings.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the foundation**

  ```bash
  git add package.json package-lock.json vitest.config.js .gitignore src/shared/settings.js tests/shared/settings.test.js
  git commit -m "feat: add validated translation settings"
  ```

### Task 2: Action popup settings interface

**Files:**
- Create: `src/popup/index.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`
- Test: `tests/popup/popup.test.js`

**Interfaces:**
- Consumes: settings exports from Task 1.
- Produces: `bindSettingsPopup({ document, storageArea }): Promise<{ dispose(): void }>` from `popup.js`.

- [ ] **Step 1: Write failing popup interaction tests**

  Assert initial hydration, 39 options in each select, Italian/English defaults, saving a valid three-field value, inline errors for invalid delay and identical languages, storage failure feedback, and listener cleanup from `dispose()`.

- [ ] **Step 2: Run the popup tests and observe failure**

  Run: `npm test -- tests/popup/popup.test.js`

  Expected: FAIL because the popup files and binding do not exist.

- [ ] **Step 3: Build the accessible popup**

  Use labeled controls with IDs `delay-ms`, `source-language`, and `target-language`, a `save-settings` button, and an `aria-live` element `settings-status`. Save only after `validateSettings()` succeeds; show Italian success/error copy without closing the popup.

- [ ] **Step 4: Run the popup tests**

  Run: `npm test -- tests/popup/popup.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the popup**

  ```bash
  git add src/popup tests/popup
  git commit -m "feat: add extension settings popup"
  ```

### Task 3: Race-safe translation controller

**Files:**
- Create: `src/content/translation-controller.js`
- Test: `tests/content/translation-controller.test.js`

**Interfaces:**
- Consumes: normalized `Settings` from Task 1 and an injected Translator-shaped API `{ availability(options), create(options) }`.
- Produces: `createTranslationController({ translatorApi, initialSettings, onStateChange, timers? })` returning `{ updateDraft(text), updateSettings(settings), retry(), getSnapshot(), dispose() }`.
- Snapshot: `{ status: "idle"|"waiting"|"preparing"|"translating"|"ready"|"error", sourceText, translatedText, progress, errorCode, generation }`.

- [ ] **Step 1: Write failing controller tests with fake timers and Translator doubles**

  Assert 700 ms debounce, no work for whitespace, exact preservation of emoji/newlines, `downloadable` progress, translator reuse for one pair, recreation after a pair change, disposal, retry, unsupported/unavailable errors, and suppression of stale draft and stale-language results.

- [ ] **Step 2: Run the controller tests and observe failure**

  Run: `npm test -- tests/content/translation-controller.test.js`

  Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the state machine**

  Advance `generation` for every draft or settings change. Capture generation, source text, and language pair around every async call and discard mismatches. Map API absence to `unsupported`, pair unavailability to `pair-unavailable`, and creation/translation failures to `translation-failed`; never throw these expected failures to the app.

- [ ] **Step 4: Run the controller tests**

  Run: `npm test -- tests/content/translation-controller.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the controller**

  ```bash
  git add src/content/translation-controller.js tests/content/translation-controller.test.js
  git commit -m "feat: add on-device translation controller"
  ```

### Task 4: Telegram Web DOM adapter

**Files:**
- Create: `src/content/telegram-adapter.js`
- Create: `tests/fixtures/telegram-a-composer.html`
- Create: `tests/fixtures/telegram-k-composer.html`
- Test: `tests/content/telegram-adapter.test.js`

**Interfaces:**
- Produces: `createTelegramAdapter({ document, pathname })` returning `{ findContext(), readDraft(context), replaceDraft(context, text), isEligible(context), sendNative(context) }`.
- `findContext()` returns `null` or `{ composer: HTMLElement, mountTarget: HTMLElement, sendButton: HTMLElement|null }`; `replaceDraft()` returns `boolean`; `sendNative()` returns `boolean` and never throws for an absent/disabled control.

- [ ] **Step 1: Create minimal A/K fixtures and failing adapter tests**

  Assert semantic composer discovery, multiline/emoji read and replace, bubbling `beforeinput`/`input` notification, a single native click, no-op unknown layouts, false eligibility with attachment fixtures, and false send results for missing or disabled controls.

- [ ] **Step 2: Run the adapter tests and observe failure**

  Run: `npm test -- tests/content/telegram-adapter.test.js`

  Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement client-specific selectors behind one adapter**

  Select strategy from pathname prefix `/a/` or `/k/`; prefer semantic `contenteditable`, role, placeholder, and nearby button attributes over generated classes. Replace text through the contenteditable DOM and dispatch compatible bubbling events without registering keyboard or Telegram-send interception.

- [ ] **Step 4: Run the adapter tests**

  Run: `npm test -- tests/content/telegram-adapter.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the adapter and fixtures**

  ```bash
  git add src/content/telegram-adapter.js tests/content/telegram-adapter.test.js tests/fixtures
  git commit -m "feat: add Telegram Web composer adapter"
  ```

### Task 5: Shadow DOM translation preview

**Files:**
- Create: `src/content/preview-panel.js`
- Test: `tests/content/preview-panel.test.js`

**Interfaces:**
- Consumes: controller snapshots from Task 3.
- Produces: `createPreviewPanel({ document, onSend, onRetry })` returning `{ host, render(snapshot), setSendEnabled(enabled), destroy() }`.

- [ ] **Step 1: Write failing panel state and accessibility tests**

  Assert hidden `idle`/`waiting`, progress for `preparing`, indicator for `translating`, safe text rendering and enabled **Invia traduzione** for `ready`, Italian copy plus **Riprova** for each error code, `aria-live`, keyboard-operable native buttons, disabled send state, callback invocation, and complete destroy.

- [ ] **Step 2: Run the panel tests and observe failure**

  Run: `npm test -- tests/content/preview-panel.test.js`

  Expected: FAIL because the preview panel does not exist.

- [ ] **Step 3: Implement the isolated panel**

  Attach an open Shadow Root, inject only local styles, and assign translated content with `textContent`. `host` must be a neutral custom element named `telegram-translator-preview`; rendering must not move focus away from Telegram's composer.

- [ ] **Step 4: Run the panel tests**

  Run: `npm test -- tests/content/preview-panel.test.js`

  Expected: PASS.

- [ ] **Step 5: Commit the panel**

  ```bash
  git add src/content/preview-panel.js tests/content/preview-panel.test.js
  git commit -m "feat: add translation preview panel"
  ```

### Task 6: Content application and extension build

**Files:**
- Create: `src/content/app.js`
- Create: `src/content/index.js`
- Create: `src/manifest.json`
- Create: `scripts/build.mjs`
- Test: `tests/content/app.test.js`

**Interfaces:**
- Consumes: Tasks 1, 3, 4, and 5.
- Produces: `startTelegramTranslator({ document, location, storageArea, translatorApi, MutationObserverClass? }): Promise<{ dispose(): void }>` and the bundled `dist/content.js` entry.

- [ ] **Step 1: Write failing application integration tests**

  Assert one panel mount across DOM replacement, input-to-controller flow, IME suppression until `compositionend`, live delay/language storage updates, removal of stale preview, refusal when source changed, translated-send replacement/click, original restoration on replace/send failure, attachment refusal, disabled double-send, cleanup, and no listeners that alter native Enter or Telegram clicks.

- [ ] **Step 2: Run the app tests and observe failure**

  Run: `npm test -- tests/content/app.test.js`

  Expected: FAIL because the application module does not exist.

- [ ] **Step 3: Implement orchestration and transactional translated sending**

  Batch `MutationObserver` discovery with one queued microtask. On send, re-read and compare the source, confirm eligibility, replace with translated text, call `sendNative()`, and restore the source plus render `send-failed` if either operation fails. Storage changes pass normalized settings to the controller and remounting always destroys the old panel/listeners first.

- [ ] **Step 4: Add the browser entry, manifest, and deterministic build**

  `index.js` injects `globalThis.Translator` and Chrome storage into `startTelegramTranslator()`. The MV3 manifest sets `minimum_chrome_version` to `138`, `permissions` to `["storage"]`, action popup to `popup/index.html`, and content matches to the two spec URLs. `build.mjs` empties only `dist/`, bundles content and popup with sourcemaps, and copies HTML/CSS/manifest assets.

- [ ] **Step 5: Run integration tests and build**

  Run: `npm test -- tests/content/app.test.js && npm run build`

  Expected: tests PASS; build exits 0 with `dist/manifest.json`, `dist/content.js`, and popup assets.

- [ ] **Step 6: Commit the integrated extension**

  ```bash
  git add src/content/app.js src/content/index.js src/manifest.json scripts/build.mjs tests/content/app.test.js package.json package-lock.json
  git commit -m "feat: integrate Telegram translation extension"
  ```

### Task 7: Icons, package verification, and user documentation

**Files:**
- Create: `src/icons/telegram-translator.svg`
- Create: `src/icons/icon-16.png`
- Create: `src/icons/icon-32.png`
- Create: `src/icons/icon-48.png`
- Create: `src/icons/icon-128.png`
- Create: `scripts/verify-dist.mjs`
- Create: `README.md`
- Modify: `src/manifest.json`
- Modify: `scripts/build.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the complete extension from Task 6.
- Produces: `npm run verify:dist`, which exits nonzero for missing required files, invalid manifest constraints, unexpected permissions/hosts, or invalid icon dimensions.

- [ ] **Step 1: Add the failing distribution verification command**

  Require MV3, Chrome 138, exactly `storage`, exactly the two Telegram matches, popup/content files, and valid 16/32/48/128 PNGs. Run `npm run build && npm run verify:dist` and confirm it fails because icons are absent.

- [ ] **Step 2: Create and wire the icon set**

  Use a simple original speech-bubble/translation-mark design with a readable two-color silhouette at 16 px. Keep the SVG source and export exact PNG dimensions; copy them during build and declare all four in manifest `icons` plus action `default_icon`.

- [ ] **Step 3: Write the README**

  Document prerequisites, `npm install`, `npm test`, `npm run build`, loading `dist/` via `chrome://extensions`, settings behavior, first model download, supported-language source, privacy, known plain-text limitations, and the 11 manual acceptance checks from the spec.

- [ ] **Step 4: Run complete verification**

  Run: `npm test && npm run build && npm run verify:dist && git diff --check`

  Expected: all tests PASS, build and distribution verification exit 0, and `git diff --check` prints nothing.

- [ ] **Step 5: Perform live acceptance checks**

  Load `dist/` unpacked in Chrome 138+ and execute the spec checklist on Web A and Web K. Record any selector differences as adapter fixture/test updates before claiming completion.

- [ ] **Step 6: Commit the release-ready project**

  ```bash
  git add src/icons src/manifest.json scripts/build.mjs scripts/verify-dist.mjs package.json README.md
  git commit -m "docs: package Telegram translator extension"
  ```
