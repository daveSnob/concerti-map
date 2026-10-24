// Adapter per la Songkick API 3.0 (opzionale).
// ATTENZIONE: Songkick non concede più chiavi per uso hobbistico e richiede una licenza
// commerciale a pagamento. L'adapter si attiva solo se SONGKICK_API_KEY è impostata.
import { fetchJson, createThrottle } from '../http.js';
import { keyOf, makeEvent } from '../normalize.js';
import { asFatalIfAuth } from './errors.js';

const BASE = 'https://api.songkick.com/api/3.0';
const throttle = createThrottle(300);
const MAX_PAGES = 4;

export const name = 'songkick';

export function isEnabled(env) {
  return Boolean(env.SONGKICK_API_KEY);
}

/** Cerca l'id Songkick dell'artista: accetta solo una corrispondenza esatta del nome. */
async function resolveArtistId(artist, apiKey) {
  if (artist.songkickId) return artist.songkickId;
  const url = `${BASE}/search/artists.json?apikey=${apiKey}&query=${encodeURIComponent(artist.name)}`;
  const data = await fetchJson(url, { throttle });
  const found = (data?.resultsPage?.results?.artist ?? []).find((a) => keyOf(a.displayName) === artist.key);
  return found?.id ?? null;
}

function toEvent(ev, artist) {
  const v = ev.venue ?? {};
  const metro = v.metroArea ?? {};
  return makeEvent({
    artist,
    source: name,
    sourceId: ev.id,
    title: ev.displayName,
    date: ev.start?.date,
    time: ev.start?.time?.slice(0, 5) ?? null,
    status: ev.status ?? null,
    venue: {
      name: v.displayName,
      city: metro.displayName ?? ev.location?.city?.split(',')[0],
      region: metro.state?.displayName,
      country: metro.country?.displayName,
      lat: v.lat ?? ev.location?.lat,
      lng: v.lng ?? ev.location?.lng,
    },
    eventUrl: ev.uri ?? null,
  });
}

export async function fetchArtistEvents(artist, { env, ids }) {
  const apiKey = env.SONGKICK_API_KEY;
  try {
    const artistId = await ids.resolve(name, artist, () => resolveArtistId(artist, apiKey));
    if (!artistId) return [];
    const events = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${BASE}/artists/${artistId}/calendar.json?apikey=${apiKey}&per_page=50&page=${page}`;
      const data = await fetchJson(url, { throttle });
      const results = data?.resultsPage?.results?.event ?? [];
      for (const ev of results) {
        if (ev.status === 'cancelled') continue;
        const e = toEvent(ev, artist);
        if (e.date) events.push(e);
      }
      if (page * 50 >= (data?.resultsPage?.totalEntries ?? 0)) break;
    }
    return events;
  } catch (err) {
    throw asFatalIfAuth(err);
  }
}
