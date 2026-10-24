// Adapter per la Ticketmaster Discovery API v2.
// Documentazione: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
// Limiti predefiniti: 5000 chiamate/giorno, alcune richieste al secondo.
import { fetchJson, createThrottle } from '../http.js';
import { keyOf, makeEvent } from '../normalize.js';
import { asFatalIfAuth } from './errors.js';

const BASE = 'https://app.ticketmaster.com/discovery/v2';
const throttle = createThrottle(550); // ~2 richieste/secondo, sotto il limite documentato
const MAX_PAGES = 5; // l'API non permette di andare oltre il 1000° risultato

export const name = 'ticketmaster';

export function isEnabled(env) {
  return Boolean(env.TICKETMASTER_API_KEY);
}

/**
 * Trova l'id "attraction" Ticketmaster dell'artista.
 * Priorità: id indicato a mano > link Spotify identico > nome identico (con più eventi).
 * Se non c'è una corrispondenza sicura restituisce null: meglio nessun evento che eventi
 * di un omonimo.
 */
async function resolveAttractionId(artist, apiKey) {
  if (artist.ticketmasterId) return artist.ticketmasterId;
  const url = `${BASE}/attractions.json?apikey=${apiKey}&keyword=${encodeURIComponent(artist.name)}`
    + '&classificationName=music&size=20';
  const data = await fetchJson(url, { throttle });
  const candidates = data?._embedded?.attractions ?? [];

  if (artist.spotifyId) {
    const bySpotify = candidates.find((c) =>
      (c.externalLinks?.spotify ?? []).some((l) => String(l.url).includes(artist.spotifyId)));
    if (bySpotify) return bySpotify.id;
  }
  const sameName = candidates
    .filter((c) => keyOf(c.name) === artist.key)
    .sort((a, b) => (b.upcomingEvents?._total ?? 0) - (a.upcomingEvents?._total ?? 0));
  return sameName[0]?.id ?? null;
}

/** Converte un evento Ticketmaster nel formato comune. */
function toEvent(ev, artist) {
  const v = ev._embedded?.venues?.[0] ?? {};
  return makeEvent({
    artist,
    source: name,
    sourceId: ev.id,
    title: ev.name,
    date: ev.dates?.start?.localDate,
    time: ev.dates?.start?.localTime?.slice(0, 5) ?? null,
    timezone: ev.dates?.timezone ?? v.timezone ?? null,
    status: ev.dates?.status?.code ?? null,
    venue: {
      name: v.name,
      address: [v.address?.line1, v.address?.line2].filter(Boolean).join(', '),
      postalCode: v.postalCode,
      city: v.city?.name,
      region: v.state?.name,
      country: v.country?.name,
      countryCode: v.country?.countryCode,
      lat: v.location?.latitude,
      lng: v.location?.longitude,
    },
    // Su Ticketmaster la pagina dell'evento è anche quella di acquisto.
    ticketUrl: ev.url ?? null,
    eventUrl: ev.url ?? null,
  });
}

/** Esclude parcheggi, upgrade e simili, che Ticketmaster pubblica come "eventi". */
function isConcert(ev) {
  if (/\b(parking|parcheggio|upgrade|shuttle)\b/i.test(ev.name ?? '')) return false;
  const segment = ev.classifications?.[0]?.segment?.name;
  return !segment || segment === 'Music';
}

/** Scarica i prossimi eventi di un artista. `ctx.ids` è la cache degli id risolti. */
export async function fetchArtistEvents(artist, { env, ids }) {
  const apiKey = env.TICKETMASTER_API_KEY;
  try {
    const attractionId = await ids.resolve(name, artist, () => resolveAttractionId(artist, apiKey));
    if (!attractionId) return [];

    const events = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${BASE}/events.json?apikey=${apiKey}&attractionId=${attractionId}`
        + `&size=200&sort=date,asc&page=${page}`;
      const data = await fetchJson(url, { throttle });
      for (const ev of data?._embedded?.events ?? []) {
        if (ev.dates?.status?.code === 'cancelled' || !isConcert(ev)) continue;
        const e = toEvent(ev, artist);
        if (e.date) events.push(e);
      }
      if (page + 1 >= (data?.page?.totalPages ?? 0)) break;
    }
    return events;
  } catch (err) {
    throw asFatalIfAuth(err);
  }
}
