# 🍼 Svezzamento — Calendario 28 giorni

Web app per seguire, giorno per giorno, il calendario di svezzamento del primo
mese (post-QA): pasti, regole quotidiane, introduzione degli allergeni e note
personali.

È una **app statica senza dipendenze** (HTML + CSS + JavaScript puro). Funziona
offline, salva i progressi sul dispositivo (`localStorage`) e non richiede alcun
backend né la build di n8n.

## Cosa copre

- **Oggi** — dato il giorno di inizio, calcola automaticamente a che giorno sei
  e mostra il piano del giorno: pasti (mattino/pranzo/pomeriggio/sera) con
  checkbox, le 5 regole fisse quotidiane (vit. D, cereale fortificato con ferro,
  vit. C nello stesso pasto, olio EVO, poppate a richiesta), l'avviso allergene
  con promemoria di osservazione 2-3h e il log della reazione, più le note del
  giorno.
- **Calendario** — tutti i 28 giorni raggruppati per settimana, con badge
  "nuovo alimento" / allergene / mantenimento, evidenza del giorno corrente e
  stato di completamento. Tocca un giorno per aprirne il dettaglio.
- **Allergeni** — stato di introduzione di ciascun allergene (carne, uovo,
  pesce, glutine, legumi, arachide), orari, schema di mantenimento
  (es. arachide ≥3×/sett), regola della spaziatura ≥48-72h e diario completo
  delle somministrazioni con reazione registrata.
- **Guida** — regole d'oro, ricetta della pappa base, note operative (etichetta
  cereale = ferro, controllo Hb/ferritina, proteine, conservazione), **glossario**
  dei termini e i segnali per fermarsi e sentire il pediatra.
- **Spesa** — lista della spesa per settimana generata dal piano (con spunte
  salvate) e checklist di **preparazione/conservazione** (cubetti freezer, brodo).
- **Impostazioni** (⚙️) — **timer di osservazione** allergene con promemoria,
  **dimensione testo** (accessibilità), **backup Esporta/Importa** dei dati (per
  passarli tra i due telefoni dei genitori), **diario stampabile** per il
  pediatra (reazioni + note, salvabile in PDF), cambio data di inizio e reset.

### Gestione allergeni

- **Onboarding guidato**: "inizio oggi", "ho già iniziato N giorni fa" o data
  scelta.
- **Timer di osservazione 2-3h** con conto alla rovescia e notifica al termine.
- **Reazione azionabile**: selezionando *Grave* compare la guida d'emergenza,
  con *Lieve/Grave* si annotano **sintomi + ora**; tutto confluisce nel diario.

## Come si usa

### In locale

Apri semplicemente `index.html` nel browser (doppio click). L'app è
completamente client-side.

> Nota: aprendo da `file://` il service worker (offline installabile) è
> disattivato dal browser, ma **tutte** le funzioni dell'app restano attive e i
> dati vengono salvati.

### Su telefono (consigliato) via GitHub Pages

1. Pubblica la cartella `svezzamento-app/` con GitHub Pages (o qualsiasi hosting
   statico).
2. Apri l'URL dal telefono e "Aggiungi alla schermata Home": si installa come
   PWA e funziona offline.

## Struttura

```
svezzamento-app/
├── index.html            # markup + navigazione
├── styles.css            # stile mobile-first, dark mode, accessibile
├── data.js               # i 28 giorni + regole + allergeni + note (dati)
├── app.js                # logica: stato, persistenza, render delle viste
├── manifest.webmanifest  # PWA
├── sw.js                 # service worker (cache offline)
├── icon.svg              # icona
└── README.md
```

I contenuti clinici sono isolati in `data.js`: per aggiornare il piano si
modifica solo quel file.

## Privacy

Tutti i dati (data di inizio, spunte, note, log reazioni) restano nel browser
del dispositivo. Nessun dato lascia il telefono; nessun account, nessun server.

## Avvertenza

Strumento di supporto basato su ESPGHAN 2017, EFSA 2015/2019, WHO 2023,
consensus SIPPS-FIMP 2022, studi LEAP/LEAP-On/PETIT e dati FITS (Abrams 2021).
**Non sostituisce il parere del pediatra**: va adattato alla crescita e alla
storia clinica della bambina in accordo col pediatra curante.
