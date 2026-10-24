// Cache degli id artista per ogni sorgente (es. "attraction id" Ticketmaster).
// Evita di cercare ogni giorno l'artista per nome: si risparmia metà della quota API.
import { PATHS, readJson, writeJson } from './store.js';

const DAY = 24 * 60 * 60 * 1000;
const TTL_FOUND = 60 * DAY;    // id trovato: lo ricontrolliamo ogni 2 mesi
const TTL_NOT_FOUND = 7 * DAY; // artista non trovato: riproviamo dopo una settimana

export async function createSourceIdCache() {
  const data = await readJson(PATHS.sourceIds, {});

  return {
    /**
     * Restituisce l'id dalla cache oppure lo calcola con `resolver()` e lo memorizza.
     * Gli id indicati a mano in artists.json non passano dalla cache.
     */
    async resolve(source, artist, resolver) {
      const bucket = (data[source] ??= {});
      const hit = bucket[artist.key];
      const ttl = hit?.id ? TTL_FOUND : TTL_NOT_FOUND;
      if (hit && Date.now() - Date.parse(hit.checkedAt) < ttl) return hit.id;
      const id = await resolver();
      bucket[artist.key] = { id: id ?? null, checkedAt: new Date().toISOString() };
      return id;
    },
    save: () => writeJson(PATHS.sourceIds, data),
  };
}
