# 🎸 Concerti live

Sito statico (GitHub Pages) che mostra i concerti degli artisti che segui su Spotify:
**mappa** dei locali (Leaflet + OpenStreetMap, con cluster), **lista** ordinabile e **calendario**,
con filtri combinabili per nazione, città, artista e intervallo di date, più un **archivio** dei concerti passati.

Le API dei concerti non vengono mai chiamate dal browser. Una **GitHub Action giornaliera**
scarica i dati con le chiavi salvate nei secret, geocodifica i locali e committa `data/events.json`.
Il frontend legge solo quel file.

```
 Spotify (artisti seguiti) ─┐
 data/artists.json ─────────┤
                            ▼
                GitHub Action (cron giornaliero)
     Ticketmaster ─┐  scripts/fetch-events.js
     Bandsintown* ─┼─► normalizza → deduplica → geocodifica (Nominatim + cache)
     Songkick*    ─┘          │
                              ▼
                     data/events.json  ──►  GitHub Pages (index.html + src/)
                                             * = opzionali
```

---

## 1. Scelte tecniche

| Ambito | Scelta | Perché |
|---|---|---|
| Frontend | HTML + CSS + JavaScript vanilla (moduli ES), senza build | Niente dipendenze da aggiornare, deploy immediato su Pages |
| Mappa | Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 (CDN con hash SRI), tile OpenStreetMap | Gratuiti e senza chiave. In dark mode i tile vengono invertiti via CSS |
| Fonte eventi principale | **Ticketmaster Discovery API v2** | Chiave gratuita in self-service, 5000 chiamate al giorno, copertura internazionale, coordinate e indirizzo dei locali già inclusi |
| Fonte opzionale | **Bandsintown API v3** | Ottima copertura dei concerti medio-piccoli. L'`app_id` però richiede il **consenso scritto** di Bandsintown e l'API è pensata per artisti e loro rappresentanti: si attiva solo se hai un `app_id` autorizzato |
| Fonte opzionale | **Songkick API** | Non concede più chiavi per uso hobbistico (licenza commerciale da circa 500 $/mese). L'adapter è incluso ma resta spento senza `SONGKICK_API_KEY` |
| Artisti | Spotify "Get Followed Artists" (`GET /me/following`, scope `user-follow-read`) oppure `data/artists.json` | Il login PKCE nel browser serve per il filtro "solo artisti che seguo" e per esportare la lista. L'Action usa invece un refresh token salvato nei secret |
| Geocodifica | Nominatim, al massimo 1 richiesta al secondo, User-Agent con contatto, cache in `data/cache/geocode.json`, al massimo 250 nuove richieste per esecuzione | Rispetta la [policy di Nominatim](https://operations.osmfoundation.org/policies/nominatim/). Si usa solo per i locali senza coordinate |
| Runtime script | Node.js 22, nessuna dipendenza npm (`fetch` nativo) | Niente `npm install` nella CI |

**Robustezza:**
- **Ultimo dato valido.** Se una sorgente fallisce, per un artista o del tutto (chiave errata, quota esaurita), vengono riutilizzati i suoi eventi futuri dal precedente `events.json`. Se Spotify non risponde, si usa l'ultimo elenco salvato in `data/spotify-artists.json`. Se lo script si interrompe per un errore imprevisto, l'Action fallisce senza committare e il sito continua a mostrare i dati precedenti. Anche il browser tiene una copia dell'ultimo `events.json` scaricato.
- **Deduplica.** Due eventi sono lo stesso concerto se hanno lo stesso artista e la stessa data, e in più la stessa città oppure coordinate entro 25 km. Se gli orari distano 2 ore o più restano separati (spettacolo pomeridiano e serale). Dalla fusione si tiene il locale più completo e tutti i link; il biglietto preferito segue l'ordine Ticketmaster, poi Bandsintown, poi Songkick.
- **Indirizzi incompleti.** La geocodifica prova l'indirizzo completo, poi "nome locale + città", poi la sola città. Nell'ultimo caso il marker è tratteggiato e il pannello avvisa che la posizione è approssimativa. I locali senza alcuna posizione compaiono solo nella lista.
- **Omonimi.** Su Ticketmaster l'artista viene riconosciuto prima tramite il link Spotify presente nella scheda, poi tramite il nome identico. Se nessuno dei due coincide, i suoi eventi vengono ignorati: meglio nessun evento che quelli di un omonimo.

## 2. Struttura dei file

```
├── index.html                      # pagina unica
├── src/
│   ├── main.js                     # avvio e coordinamento delle viste
│   ├── config.js                   # Client ID Spotify e opzioni
│   ├── state.js                    # stato + pub/sub + sincronizzazione con l'URL
│   ├── data.js                     # caricamento di events.json (con copia locale di riserva)
│   ├── filters.js                  # filtri combinabili e tendine "a faccette"
│   ├── map.js                      # Leaflet + cluster
│   ├── list.js                     # lista per mese con paginazione
│   ├── calendar.js                 # griglia mensile
│   ├── event-card.js               # scheda di un concerto
│   ├── venue-panel.js              # dettaglio del locale
│   ├── spotify.js                  # login PKCE e artisti seguiti
│   ├── spotify-panel.js            # artisti non monitorati + download di artists.json
│   ├── status.js                   # piè di pagina e banner (stato delle sorgenti)
│   ├── theme.js                    # tema chiaro/scuro/automatico
│   ├── utils.js
│   └── styles.css
├── data/
│   ├── artists.json                # artisti aggiunti a mano (modificabile)
│   ├── events.json                 # generato dall'Action, letto dal sito
│   ├── spotify-artists.json        # generato: ultimo elenco Spotify valido
│   └── cache/                      # generati: cache di geocodifica e id artista
├── scripts/
│   ├── fetch-events.js             # pipeline di aggiornamento
│   ├── spotify-auth.js             # helper una tantum per il refresh token
│   ├── lib/
│   │   ├── artists.js  spotify.js  normalize.js  dedupe.js  geocode.js
│   │   ├── venues.js   previous.js source-ids.js http.js    store.js
│   │   └── sources/    ticketmaster.js bandsintown.js songkick.js errors.js index.js
│   └── test/                       # test con node:test (anche end-to-end con fetch simulato)
└── .github/workflows/
    ├── update-events.yml           # cron giornaliero: aggiorna, committa, ripubblica
    └── deploy-pages.yml            # deploy su GitHub Pages
```

## 3. Configurazione passo passo

### 3.1 Crea il repository

```bash
git remote add origin https://github.com/<utente>/concerti-map.git
git push -u origin main
```

### 3.2 Chiave Ticketmaster (obbligatoria per avere concerti)

1. Registrati su <https://developer-acct.ticketmaster.com/user/register>.
2. In **My Apps** apri l'app predefinita e copia la **Consumer Key**: è la `TICKETMASTER_API_KEY`.

### 3.3 Spotify (facoltativo)

Dal febbraio 2026 le app Spotify in *Development Mode* richiedono che il **proprietario abbia Spotify Premium**
e sono limitate a **5 utenti autorizzati**. Per uso personale va benissimo.

1. Vai su <https://developer.spotify.com/dashboard> → **Create app**, seleziona *Web API*.
2. In **Redirect URIs** aggiungi:
   - `http://127.0.0.1:8888/callback`, per lo script che ottiene il refresh token;
   - `https://<utente>.github.io/concerti-map/`, per il login dal sito (con la barra finale).
3. In **User Management** aggiungi l'email del tuo account Spotify, e di chi altro userà il login.
4. Copia **Client ID** e **Client Secret**.
5. Ottieni il refresh token (una sola volta, sul tuo PC):

   ```bash
   # macOS/Linux
   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy npm run spotify-auth
   # Windows PowerShell
   $env:SPOTIFY_CLIENT_ID="xxx"; $env:SPOTIFY_CLIENT_SECRET="yyy"; npm run spotify-auth
   ```
   Apri il link stampato, accetta e copia il refresh token che compare nel terminale.
6. Per il login dal sito, inserisci il Client ID in `src/config.js` (`spotifyClientId`). È un valore pubblico: il flusso PKCE non usa segreti.

### 3.4 Secret del repository

**Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Obbligatorio | Descrizione |
|---|---|---|
| `TICKETMASTER_API_KEY` | sì | Consumer Key di Ticketmaster |
| `NOMINATIM_EMAIL` | consigliato | tua email, inviata a Nominatim come contatto |
| `SPOTIFY_CLIENT_ID` | no | per leggere gli artisti seguiti |
| `SPOTIFY_CLIENT_SECRET` | no | " |
| `SPOTIFY_REFRESH_TOKEN` | no | da `npm run spotify-auth` |
| `BANDSINTOWN_APP_ID` | no | solo con autorizzazione scritta di Bandsintown |
| `SONGKICK_API_KEY` | no | solo con licenza Songkick |

Per conservare l'archivio più o meno a lungo puoi aggiungere `ARCHIVE_DAYS` (predefinito 365) nella sezione `env` del workflow.

### 3.5 Attiva GitHub Pages

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions**: seleziona *Read and write permissions*, che servono al commit di `data/`.
3. **Actions → Aggiorna concerti → Run workflow** per il primo aggiornamento. Il sito sarà su
   `https://<utente>.github.io/concerti-map/`.

Da quel momento il workflow gira **ogni giorno alle 04:17 UTC** e ripubblica il sito. Ogni push su `main` ripubblica anche il sito.

### 3.6 Prova in locale

```bash
npm test                                  # test unitari ed end-to-end (nessuna rete)
TICKETMASTER_API_KEY=xxx npm run fetch    # aggiorna data/events.json
npm run serve                             # http://localhost:8080
```

## 4. Aggiungere un artista a mano

Modifica `data/artists.json` e fai commit:

```json
{
  "artists": [
    { "name": "Radiohead", "spotifyId": "4Z8W4fKeB5YxbusRsdQVPb" },
    { "name": "Vasco Rossi" },
    { "name": "Nome Ambiguo", "ticketmasterId": "K8vZ9171ob7", "bandsintownName": "Nome Ambiguo Band" }
  ],
  "exclude": ["Artista seguito su Spotify ma da ignorare"]
}
```

- `name` è l'unico campo obbligatorio.
- `spotifyId`, facoltativo, rende sicuro il riconoscimento su Ticketmaster. Lo trovi nell'URL `open.spotify.com/artist/<id>`.
- `ticketmasterId`, `bandsintownName` e `songkickId` forzano l'abbinamento quando quello automatico sbaglia o non trova l'artista.
- `exclude` nasconde artisti che arrivano da Spotify.

Senza secret Spotify puoi anche **accedere con Spotify dal sito**, aprire il pulsante verde e scaricare un
`artists.json` già unito con gli artisti che segui, da sostituire nel repository.

## 5. Limiti noti

- **Copertura.** Ticketmaster copre bene arene, palazzetti e club grandi o medi in Nord America ed Europa, poco i piccoli club, i festival indipendenti e i mercati che non gestisce (in Italia molti concerti sono su TicketOne o Dice). Bandsintown e Songkick colmerebbero il buco, ma oggi l'accesso è soggetto ad autorizzazione o a pagamento.
- **Abbinamento artisti.** Se su Ticketmaster l'artista non ha il link Spotify e il nome non coincide esattamente (es. "AC/DC" contro "ACDC"), non viene trovato: indica `ticketmasterId` a mano. Gli artisti non trovati vengono ricercati di nuovo dopo 7 giorni.
- **Quote.** Con 5000 chiamate al giorno e circa 1–2 chiamate per artista (gli id sono in cache per 60 giorni), il limite pratico è di circa 2000 artisti. La geocodifica è limitata a 250 nuovi locali per esecuzione: con molti locali nuovi la mappa si completa nei giorni successivi.
- **Spotify Development Mode.** Servono Premium per il proprietario dell'app e al massimo 5 utenti. Il login dal sito funziona solo per gli account aggiunti in *User Management*. Spotify ha annunciato altre restrizioni agli endpoint, quindi conviene controllare il changelog.
- **Deduplica euristica.** Se due fonti riportano città diverse e locali a più di 25 km (es. un'arena di periferia con città sbagliata), un concerto può comparire due volte. Due nomi diversi per lo stesso locale producono due marker vicini.
- **Fusi orari.** Date e orari sono quelli locali del concerto. "Passato" e "futuro" si calcolano sulla data del tuo dispositivo, quindi un concerto resta tra i futuri per tutto il giorno in cui si tiene.
- **Tile OpenStreetMap.** Il server pubblico va bene per traffico personale. Se il sito diventa popolare usa un provider di tile dedicato (cambia l'URL in `src/map.js`).
- **Ritardo.** I dati si aggiornano una volta al giorno. Puoi forzare un aggiornamento con *Run workflow*.
- **Termini d'uso.** Rispetta i termini di ciascuna API, ad esempio i requisiti di attribuzione e branding di Ticketmaster per usi pubblici o commerciali.
