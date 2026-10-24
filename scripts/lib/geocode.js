// Geocodifica dei locali con Nominatim (OpenStreetMap), con cache persistente.
//
// Regole d'uso di Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
//  - al massimo 1 richiesta al secondo;
//  - User-Agent che identifichi l'applicazione, con un contatto;
//  - risultati da memorizzare in cache, niente richieste ripetute.
import { fetchJson, createThrottle } from './http.js';
import { keyOf } from './normalize.js';
import { PATHS, readJson, writeJson } from './store.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const throttle = createThrottle(1100); // un po' più di 1 secondo, per sicurezza
const RETRY_FAILED_AFTER_DAYS = 30;

/**
 * Crea il geocoder. `maxRequests` limita le nuove richieste per esecuzione:
 * i locali rimanenti verranno geocodificati alle esecuzioni successive.
 */
export async function createGeocoder({ userAgent, maxRequests = 250 }) {
  const cache = await readJson(PATHS.geocache, {});
  let requests = 0;
  let dirty = false;

  /** Una singola ricerca (strutturata), con cache anche dei risultati negativi. */
  async function search(params) {
    const cacheKey = Object.values(params).map(keyOf).join('|');
    const hit = cache[cacheKey];
    if (hit) {
      const age = (Date.now() - Date.parse(hit.at)) / 86400000;
      if (hit.lat != null || age < RETRY_FAILED_AFTER_DAYS) return hit.lat != null ? hit : null;
    }
    if (requests >= maxRequests) return undefined; // budget esaurito: riproveremo domani
    requests += 1;

    const qs = new URLSearchParams({ format: 'jsonv2', limit: '1', ...params });
    let result = null;
    try {
      const data = await fetchJson(`${NOMINATIM}?${qs}`, {
        throttle,
        headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' },
      });
      if (data?.[0]) result = { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    } catch (err) {
      console.warn(`⚠️  Nominatim: ${err.message}`);
      return undefined; // errore temporaneo: non salviamo in cache
    }
    cache[cacheKey] = { ...(result ?? { lat: null, lng: null }), at: new Date().toISOString() };
    dirty = true;
    return result;
  }

  return {
    /**
     * Completa le coordinate di un locale, se mancano.
     * 1. indirizzo completo (via + città + nazione);
     * 2. fallback sul nome del locale + città;
     * 3. fallback sulla sola città: la posizione viene marcata come approssimativa.
     */
    async locate(venue) {
      // Coordinate già presenti (dalla sorgente o da un'esecuzione precedente).
      if (venue.lat != null && venue.lng != null) {
        return { ...venue, geo: venue.geo ?? 'source', approximate: venue.approximate ?? false };
      }
      const country = venue.country ?? venue.countryCode ?? '';
      // countrycodes restringe la ricerca alla nazione giusta (evita "Paris, Texas").
      const base = venue.countryCode ? { countrycodes: venue.countryCode.toLowerCase() } : {};

      const attempts = [];
      if (venue.address && venue.city) {
        attempts.push([{ ...base, street: venue.address, city: venue.city, country }, 'address', false]);
      }
      if (venue.name && venue.city) {
        attempts.push([{ ...base, q: `${venue.name}, ${venue.city}` }, 'venue', false]);
      }
      if (venue.city) {
        attempts.push([{ ...base, city: venue.city, country }, 'city', true]);
      }
      for (const [params, geo, approximate] of attempts) {
        // Rimuoviamo i parametri vuoti (Nominatim non li gradisce).
        for (const k of Object.keys(params)) if (!params[k]) delete params[k];
        const r = await search(params);
        if (r === undefined) break; // budget esaurito o errore: lasciamo senza coordinate
        if (r) return { ...venue, lat: r.lat, lng: r.lng, geo, approximate };
      }
      return { ...venue, geo: null, approximate: false };
    },
    get requests() { return requests; },
    async save() { if (dirty) await writeJson(PATHS.geocache, cache); },
  };
}
