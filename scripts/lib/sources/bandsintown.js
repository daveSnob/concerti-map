// Adapter per la Bandsintown API v3 (opzionale).
// ATTENZIONE: l'app_id si ottiene solo con il consenso scritto di Bandsintown e l'API
// è pensata per artisti e loro rappresentanti. Abilitala solo se hai un app_id autorizzato.
// Documentazione: https://help.artists.bandsintown.com/en/articles/7053475-what-is-the-bandsintown-api
import { fetchJson, createThrottle, HttpError } from '../http.js';
import { makeEvent, splitLocalDateTime } from '../normalize.js';
import { asFatalIfAuth } from './errors.js';

const BASE = 'https://rest.bandsintown.com';
const throttle = createThrottle(300);

export const name = 'bandsintown';

export function isEnabled(env) {
  return Boolean(env.BANDSINTOWN_APP_ID);
}

/**
 * Bandsintown richiede un doppio escape per alcuni caratteri nel nome dell'artista
 * (/ ? * ") come indicato nella sua documentazione.
 */
function encodeArtistName(n) {
  return encodeURIComponent(n)
    .replace(/%2F/g, '%252F')
    .replace(/%3F/g, '%253F')
    .replace(/\*/g, '%252A')
    .replace(/%22/g, '%27C');
}

function toEvent(ev, artist) {
  const { date, time } = splitLocalDateTime(ev.datetime);
  const v = ev.venue ?? {};
  const tickets = (ev.offers ?? []).find((o) => /ticket/i.test(o.type ?? '') && o.url);
  return makeEvent({
    artist,
    source: name,
    sourceId: ev.id,
    title: ev.title,
    date,
    time: time === '00:00' ? null : time,
    venue: {
      name: v.name,
      address: v.street_address,
      postalCode: v.postal_code,
      city: v.city,
      region: v.region,
      country: v.country,
      lat: v.latitude,
      lng: v.longitude,
    },
    ticketUrl: tickets?.url ?? null,
    eventUrl: ev.url ?? null,
  });
}

export async function fetchArtistEvents(artist, { env }) {
  const artistName = artist.bandsintownName ?? artist.name;
  const url = `${BASE}/artists/${encodeArtistName(artistName)}/events`
    + `?app_id=${encodeURIComponent(env.BANDSINTOWN_APP_ID)}&date=upcoming`;
  try {
    const data = await fetchJson(url, { throttle });
    // Se l'artista non esiste l'API può rispondere con un oggetto { errorMessage } o vuoto.
    if (!Array.isArray(data)) return [];
    return data.map((ev) => toEvent(ev, artist)).filter((e) => e.date);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return [];
    throw asFatalIfAuth(err);
  }
}
