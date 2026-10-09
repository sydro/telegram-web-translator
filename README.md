# Telegram Web Translator

Estensione Chrome Manifest V3 che mostra un'anteprima tradotta sopra il campo
di composizione di Telegram Web. La traduzione viene eseguita sul dispositivo
con la Chrome Translator API.

Il normale Invio di Telegram continua a spedire il testo originale. Solo il
pulsante **Invia traduzione** dell'estensione sostituisce il testo e invia la
traduzione visualizzata.

## Requisiti

- Google Chrome desktop 138 o successivo;
- Telegram Web A (`https://web.telegram.org/a/`) oppure Web K
  (`https://web.telegram.org/k/`);
- Node.js 20 o successivo soltanto per testare e compilare il progetto.

La Translator API non è disponibile su Chrome mobile.

## Preparazione e test

```bash
npm install
npm test
npm run build
npm run verify:dist
```

Il build genera `dist/`, la cartella completa da caricare in Chrome. I file in
`dist/` sono generati e non devono essere modificati manualmente.

## Installazione in Chrome

1. Esegui `npm run build`.
2. Apri `chrome://extensions`.
3. Attiva **Modalità sviluppatore**.
4. Premi **Carica estensione non pacchettizzata**.
5. Seleziona la cartella `dist/` di questo progetto.
6. Apri o ricarica Telegram Web.

## Utilizzo

Scrivi normalmente nel composer di Telegram. Durante la digitazione non appare
nulla. Quando smetti di scrivere per il ritardo configurato, compare sopra il
composer una scheda con la traduzione.

- Premi Invio o il pulsante originale di Telegram per inviare il testo
  originale.
- Premi **Invia traduzione** nella scheda per inviare il testo tradotto.
- Se modifichi il messaggio, la vecchia anteprima viene nascosta subito e viene
  calcolata nuovamente dopo la pausa.

Al primo utilizzo di una coppia linguistica Chrome può scaricare il relativo
modello. La scheda mostra l'avanzamento quando Chrome lo rende disponibile.

## Impostazioni

Premi l'icona dell'estensione nella barra di Chrome per modificare:

- **Estensione attiva**, un interruttore salvato immediatamente che sospende o
  riattiva traduzioni e anteprime senza interferire con Telegram;
- **Lingua di origine**, predefinita su Italiano;
- **Lingua di destinazione**, predefinita su Inglese;
- **Ritardo anteprima**, da 300 a 3000 ms a intervalli di 100 ms, predefinito
  su 700 ms.

Le lingue devono essere diverse. Le impostazioni sono salvate in
`chrome.storage.sync` e vengono applicate anche alle schede Telegram già
aperte. L'estensione include le 39 lingue elencate nella
[documentazione della Translator API](https://developer.chrome.com/docs/ai/translator-api#supported-languages)
e verifica la disponibilità della coppia scelta sul Chrome in uso.

## Privacy

Il testo dei messaggi:

- resta in memoria soltanto nella scheda Telegram corrente;
- viene elaborato dalla Translator API locale di Chrome;
- non viene salvato dall'estensione;
- non viene registrato nei log;
- non viene inviato dall'estensione a server o API esterne.

In storage vengono conservati soltanto lo stato attivo/disattivo, il ritardo e
i due codici lingua. Chrome può collegarsi ai propri servizi per scaricare i
modelli linguistici, ma il download del modello non contiene il testo del
messaggio.

## Limitazioni della prima versione

- Sono supportati soltanto messaggi di testo semplice.
- L'invio tradotto viene disabilitato quando è presente un allegato.
- Formattazione avanzata, didascalie, invio programmato o silenzioso, messaggi
  vocali, sticker e Telegram mobile non sono supportati.
- I selettori DOM di Telegram sono isolati nell'adattatore, ma un futuro cambio
  strutturale di Telegram Web potrebbe richiedere un aggiornamento.
- Non è presente il rilevamento automatico della lingua: origine e destinazione
  vengono scelte nelle impostazioni.

## Verifica manuale

Esegui questi controlli sia su Telegram Web A sia su Web K:

1. Durante una digitazione continua non è visibile alcuna scheda.
2. La scheda appare soltanto dopo il ritardo configurato.
3. Una modifica nasconde immediatamente la traduzione precedente.
4. Invio e il pulsante nativo di Telegram spediscono il testo originale.
5. **Invia traduzione** spedisce una sola volta esattamente il testo mostrato.
6. Modifiche rapide non mostrano e non inviano una traduzione obsoleta.
7. Il primo download del modello mostra lo stato e le traduzioni successive
   riutilizzano il modello pronto.
8. Cambiare ritardo o lingue aggiorna una scheda Telegram già aperta.
9. Disattivare il toggle rimuove subito la scheda e impedisce nuove traduzioni;
   riattivarlo riprende dal testo presente nel composer.
10. Le coppie disponibili funzionano; una coppia indisponibile mostra un errore
   senza bloccare Telegram.
11. Cambiare chat lascia una sola scheda montata accanto al nuovo composer.
12. Un errore di traduzione non interferisce con il normale invio di Telegram.

## Struttura essenziale

- `src/shared/settings.js`: catalogo, validazione e storage;
- `src/content/translation-controller.js`: debounce e Translator API;
- `src/content/telegram-adapter.js`: integrazione DOM Web A/K;
- `src/content/preview-panel.js`: interfaccia Shadow DOM;
- `src/content/app.js`: orchestrazione e invio transazionale;
- `src/popup/`: pannello impostazioni;
- `scripts/`: build e verifica della distribuzione.
