// Raggruppa gli eventi per locale, geocodifica ogni locale una sola volta
// e produce la struttura finale { venues, events } letta dal frontend.
import { createHash } from 'node:crypto';
import { keyOf } from './normalize.js';

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

/** Chiave del locale: nome + città + nazione normalizzati. */
export function venueKey(v) {
  return [keyOf(v.name), keyOf(v.city), v.countryCode ?? keyOf(v.country)].join('|');
}

/** Punteggio di completezza: le coordinate "vere" valgono più di quelle approssimative. */
function score(v) {
  const fields = ['address', 'postalCode', 'region', 'countryCode'].filter((k) => v[k] != null).length;
  const coords = v.lat == null ? 0 : v.approximate ? 1 : 3;
  return fields + coords;
}

/**
 * @param events eventi normalizzati (ognuno con il proprio oggetto `venue`)
 * @param geocoder istanza di createGeocoder()
 */
export async function buildVenues(events, geocoder) {
  // 1. Per ogni locale teniamo la versione con più informazioni.
  const byKey = new Map();
  for (const ev of events) {
    const key = venueKey(ev.venue);
    const current = byKey.get(key);
    if (!current || score(ev.venue) > score(current)) byKey.set(key, ev.venue);
  }

  // 2. Geocodifica (solo per i locali senza coordinate; i risultati sono in cache).
  const venues = new Map();
  for (const [key, v] of byKey) {
    const located = await geocoder.locate(v);
    venues.set(key, { id: `v-${hash(key)}`, ...located });
  }

  // 3. Gli eventi puntano al locale tramite venueId (niente dati duplicati nel JSON).
  const outEvents = events.map(({ venue, ...ev }) => {
    const key = venueKey(venue);
    return {
      id: `e-${hash(`${ev.artistKey}|${ev.date}|${ev.time ?? ''}|${key}`)}`,
      ...ev,
      venueId: venues.get(key).id,
    };
  });

  return { venues: [...venues.values()], events: outEvents };
}
