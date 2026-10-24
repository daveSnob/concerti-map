// Funzioni di normalizzazione: chiavi di confronto, codici nazione, formato evento comune.

/**
 * Chiave di confronto per nomi (artisti, città, locali):
 * minuscolo, senza accenti, senza punteggiatura e senza "the" iniziale.
 * Esempio: "The Beatles" e "beatles" -> "beatles"; "München" -> "munchen".
 */
export function keyOf(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/ /g, '-');
}

// Mappa "nome nazione in inglese" -> codice ISO 3166-1 alpha-2, costruita con Intl
// (nessuna tabella da mantenere a mano). Alcune API restituiscono solo il nome.
const COUNTRY_CODES = (() => {
  const map = new Map();
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      try {
        const name = names.of(code);
        // Il primo codice vince: es. "United Kingdom" resta GB e non diventa l'alias UK.
        if (name && name !== code && !map.has(keyOf(name))) map.set(keyOf(name), code);
      } catch { /* codice non valido */ }
    }
  }
  // Varianti frequenti nelle API di eventi.
  const aliases = {
    'usa': 'US', 'united-states-of-america': 'US',
    'uk': 'GB', 'great-britain': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
    'northern-ireland': 'GB', 'korea-republic-of': 'KR', 'czech-republic': 'CZ',
    'russia': 'RU', 'holland': 'NL',
  };
  for (const [k, v] of Object.entries(aliases)) map.set(k, v);
  return map;
})();

/** Restituisce il codice ISO a 2 lettere a partire da codice o nome della nazione. */
export function countryCode(codeOrName) {
  if (!codeOrName) return null;
  const s = String(codeOrName).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase() === 'UK' ? 'GB' : s.toUpperCase();
  return COUNTRY_CODES.get(keyOf(s)) ?? null;
}

/** Ripulisce una stringa: spazi compattati, null se vuota. */
export function clean(str) {
  const s = String(str ?? '').replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Estrae "YYYY-MM-DD" e "HH:MM" da una data/ora locale ISO ("2026-11-03T20:00:00"). */
export function splitLocalDateTime(iso) {
  const m = String(iso ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m ? { date: m[1], time: m[2] ?? null } : { date: null, time: null };
}

/** Data odierna (UTC) in formato YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Aggiunge (o sottrae) giorni a una data YYYY-MM-DD. */
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Distanza in km tra due coordinate (formula dell'haversine). */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Converte in numero una coordinata; null se mancante o non valida. */
export function coord(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Costruisce un evento nel formato comune a tutte le sorgenti.
 * Ogni adapter (Ticketmaster, Bandsintown, Songkick) chiama questa funzione.
 */
export function makeEvent({ artist, source, sourceId, date, time = null, timezone = null, status = null,
  venue, ticketUrl = null, eventUrl = null, title = null }) {
  const lat = coord(venue?.lat);
  const lng = coord(venue?.lng);
  // Alcune API restituiscono 0,0 quando la posizione è sconosciuta: lo trattiamo come assente.
  const hasCoords = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  return {
    artist: artist.name,
    artistKey: artist.key,
    spotifyId: artist.spotifyId ?? null,
    title: clean(title),
    date,
    time,
    timezone,
    status,
    venue: {
      name: clean(venue?.name) ?? 'Locale sconosciuto',
      address: clean(venue?.address),
      postalCode: clean(venue?.postalCode),
      city: clean(venue?.city),
      region: clean(venue?.region),
      country: clean(venue?.country),
      countryCode: countryCode(venue?.countryCode ?? venue?.country),
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
    },
    ticketUrl,
    eventUrl,
    links: [
      ticketUrl && { source, type: 'tickets', url: ticketUrl },
      eventUrl && eventUrl !== ticketUrl && { source, type: 'event', url: eventUrl },
    ].filter(Boolean),
    sources: [source],
  };
}
