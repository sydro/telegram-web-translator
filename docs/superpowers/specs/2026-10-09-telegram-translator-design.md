# Telegram Web Translator — Design Specification

## Goal

Build a Chrome Manifest V3 extension that helps a user write messages in a
chosen source language on Telegram Web and optionally send a translation in a
chosen target language. The extension must preserve Telegram's normal sending
behavior: Enter and
Telegram's own send button always send the original draft unchanged. A separate
extension button sends the translated text.

The extension targets Chrome desktop 138 or later and both official Telegram
Web clients:

- `https://web.telegram.org/a/*`
- `https://web.telegram.org/k/*`

## Product behavior

### Translation preview

1. The user types in the configured source language in Telegram's existing
   message composer.
2. While typing, the extension shows no preview.
3. After the configured period without an input change, initially 700 ms, the
   extension starts translating the complete draft from the configured source
   language to the configured target language. The defaults are Italian (`it`)
   and English (`en`).
4. A compact panel appears directly above the Telegram composer. It contains
   the translated text and an **Invia traduzione** button.
5. Further input immediately invalidates the displayed translation and hides
   the panel until the next quiet period expires.
6. An empty or whitespace-only composer never triggers translation and keeps
   the panel hidden.

The preview is informational and does not alter the Telegram composer.

### Sending

- Pressing Enter or clicking Telegram's own send button remains entirely under
  Telegram's control and sends the original draft.
- Clicking **Invia traduzione** replaces the current composer value with the
  exact translated preview, emits the input events Telegram expects, and invokes
  Telegram's native send action.
- Immediately before replacement, the extension verifies that the original
  draft still matches the source text used for the preview. If it does not,
  sending is refused and a fresh translation is scheduled.
- The translation button is disabled while translation or sending is in
  progress, which prevents duplicate submissions.
- If the native send action cannot be completed, the extension restores the
  original draft and displays an error. On a successful send, Telegram
  is responsible for clearing the composer and the extension clears its
  preview state.

This first version handles plain text. Telegram formatting, attached media,
captions, voice messages, stickers, and scheduled or silent-send menus are out
of scope. If a plain-text draft accompanies an attachment, the extension will
not offer translated sending, to avoid changing Telegram's attachment flow.

## Settings popup

Clicking the extension icon opens a small Chrome action popup. The first
version exposes three settings:

- **Ritardo anteprima**: an integer from 300 through 3000 milliseconds, in
  increments of 100 ms; default 700 ms.
- **Lingua di origine**: a select containing the source languages supported by
  Chrome Translator; default Italian (`it`).
- **Lingua di destinazione**: a select containing the target languages
  supported by Chrome Translator; default English (`en`).

The language catalog mirrors the languages documented for Chrome's Translator
API and gives every code a localized, human-readable label. The initial
catalog is: Arabic (`ar`), Bulgarian (`bg`), Bengali (`bn`), Czech (`cs`),
Danish (`da`), German (`de`), Greek (`el`), English (`en`), Spanish (`es`),
Finnish (`fi`), French (`fr`), Hebrew (`he`), Hindi (`hi`), Croatian (`hr`),
Hungarian (`hu`), Indonesian (`id`), Italian (`it`), Japanese (`ja`), Kannada
(`kn`), Korean (`ko`), Lithuanian (`lt`), Marathi (`mr`), Dutch (`nl`),
Norwegian (`no`), Polish (`pl`), Portuguese (`pt`), Romanian (`ro`), Russian
(`ru`), Slovak (`sk`), Slovenian (`sl`), Swedish (`sv`), Tamil (`ta`), Telugu
(`te`), Thai (`th`), Turkish (`tr`), Ukrainian (`uk`), Vietnamese (`vi`),
Chinese Simplified (`zh`), and Chinese Traditional (`zh-Hant`).

Chrome does not currently provide an API that dynamically enumerates its
language catalog, so this list is maintained with the extension. Actual pair
support is always checked at runtime with `Translator.availability()`. The
source and target must differ. If the selected pair is not available on the
user's Chrome installation, the settings remain saved and the Telegram panel
reports that the pair is unavailable.

The popup validates all values before saving. Empty, non-numeric, out-of-range,
or off-step delay values, unknown language codes, and identical source and
target values show an inline validation message and are not saved. If stored
data is missing or invalid, consumers use the defaults without silently
rewriting storage.

The settings are stored with `chrome.storage.sync`. A content script listens
for storage changes, so open Telegram tabs adopt changes immediately without
being reloaded. A language change hides any existing preview, invalidates
in-flight translation work, destroys the translator for the previous pair,
and schedules a new translation for the current draft after the configured
delay. If synchronization is unavailable, Chrome's storage API still makes
the values available to the current profile.

## Architecture

The extension uses plain JavaScript, HTML, and CSS with no runtime framework,
remote script, backend, or translation API key.

### Manifest

`manifest.json` declares:

- Manifest V3 and a minimum Chrome version of 138;
- a statically registered content script for the two Telegram Web URL forms;
- an action popup for settings;
- the `storage` permission.

The extension requests no broad host access beyond Telegram Web and makes no
network request itself.

### Telegram adapter

A Telegram adapter isolates all DOM-specific behavior:

- locate the currently active plain-text composer;
- read and replace its text while preserving Telegram-compatible input events;
- locate and activate Telegram's native send control;
- detect attachment or non-standard composition states;
- provide a stable mount point adjacent to the composer.

The adapter uses semantic attributes, editable roles, and structure local to
the active composer rather than generated class names wherever possible.
Telegram is a single-page application, so a scoped `MutationObserver` detects
conversation and composer replacement. Observation work is batched to avoid
repeated full-document scans.

Support for Web A and Web K lives behind the same adapter interface but may use
client-specific selector strategies. If no supported composer is found, the
extension remains inert and does not modify the page.

### Translation controller

The controller owns a small state machine:

- `idle`: no eligible draft;
- `waiting`: debounce timer is active;
- `preparing`: the language pack is being prepared or downloaded;
- `translating`: a translation request is running;
- `ready`: the preview matches the current source draft;
- `sending`: translated text is being handed to Telegram;
- `error`: the last preparation, translation, or send attempt failed.

Each input change increments a generation number and cancels any pending timer.
Asynchronous results update the interface only when their captured generation
and source text still match the current draft. This prevents an older result
from replacing a newer translation.

The controller creates and reuses one Chrome `Translator` instance configured
for the currently selected source and target language pair. It feature-detects
the API and checks `Translator.availability()` for that pair before creation.
Creation is started from the user's typing interaction after the debounce
period so that Chrome
can satisfy its user-activation requirements when the language pack needs to
be downloaded. Download progress is forwarded to the preview panel.

Translator instances are destroyed when the content script is disposed or
when creation fails in a way that requires a fresh instance.

### Preview panel

The extension mounts a host element next to the active composer and renders the
panel in a Shadow DOM. This prevents Telegram styles from leaking into the
extension and extension styles from changing Telegram.

The panel supports these visible states:

- language-pack download with progress when Chrome reports it;
- unobtrusive translating indicator;
- translated text and enabled **Invia traduzione** button;
- concise error text and **Riprova** button.

The panel is keyboard accessible, preserves visible focus, uses semantic button
elements, and announces status changes through an `aria-live` region. It is
removed and remounted when Telegram replaces the active composer.

### Settings module

A shared settings module defines the defaults, language catalog, validation
rules, and storage keys. The action popup uses it to validate and save values.
The content script uses the same rules when reading initial state and processing
`chrome.storage.onChanged` events.

## Data and privacy

Draft text is held only in memory for the current Telegram tab. It is passed to
Chrome's on-device Translator API and is never placed in extension storage,
logged, or sent by the extension to a remote service. Only the numeric delay
and the two language codes are stored.

The first translation for a language pair may cause Chrome to download the
corresponding language pack. This is Chrome-managed model data, not a
transmission of the user's message.

## Error handling

- If `Translator` is unavailable, the panel explains that Chrome desktop 138+
  is required; normal Telegram behavior remains unaffected.
- If the language pair is unavailable or model preparation fails, the panel
  shows **Traduzione non disponibile** with **Riprova**.
- Translation errors never change the composer.
- Stale async results are discarded without showing an error.
- A failed translated send restores the source draft and leaves normal sending
  available.
- DOM changes or unknown Telegram layouts cause the adapter to detach cleanly
  and retry discovery; they do not intercept Telegram's keyboard or click
  handlers.

## Testing strategy

### Automated tests

Test framework-independent logic outside the live Telegram page:

- delay and language validation, including default fallback and distinct-pair
  enforcement;
- complete rendering of the supported-language catalog in both selectors;
- debounce scheduling and cancellation;
- generation-based stale-result suppression;
- controller state transitions for available, downloadable, and failed models;
- send precondition that source text still matches the preview;
- failed-send restoration;
- delay changes taking effect without reload;
- language changes invalidating the old preview, translator, and asynchronous
  work.

DOM adapter fixtures cover both Web A and Web K representative composer
structures. They verify discovery, text reading/replacement, native send
activation, panel mounting, and safe no-op behavior for unsupported or
attachment states.

### Manual acceptance checks

Run the unpacked extension in Chrome 138 or later against both Telegram Web
clients and verify:

1. No panel is visible during continuous typing.
2. The panel appears only after the configured quiet period.
3. Editing invalidates the prior preview immediately.
4. Enter and Telegram's send button send the original text.
5. **Invia traduzione** sends exactly the displayed translated text once.
6. Rapid edits cannot display or send a stale translation.
7. First-time language-pack download reports progress and later translations
   reuse the prepared translator.
8. Changing the delay or either language in the action popup affects an
   already-open Telegram tab.
9. Several available language pairs translate correctly; unavailable pairs
   produce a clear error without affecting normal Telegram sending.
10. Switching chats remounts the panel beside the new composer without leaking
   observers or duplicate panels.
11. Translation failures do not interfere with ordinary Telegram messaging.

## Deliverables

- installable unpacked Manifest V3 extension;
- extension icons and action popup;
- content script, Telegram adapter, translation controller, and preview panel;
- automated test suite;
- README with installation, compatibility, privacy, and manual verification
  instructions.

Publishing to the Chrome Web Store, telemetry, automatic language detection,
rich-text preservation, and mobile support are outside this version.
