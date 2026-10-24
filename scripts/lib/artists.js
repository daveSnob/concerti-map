// Costruisce la lista finale degli artisti da monitorare unendo:
//  1. data/artists.json (modificabile a mano, ha sempre la precedenza);
//  2. gli artisti seguiti su Spotify (se i secret sono configurati);
//  3. in caso di errore Spotify, l'ultimo elenco valido (data/spotify-artists.json).
import { fetchFollowedArtists } from './spotify.js';
import { keyOf } from './normalize.js';
import { PATHS, readJson, writeJson } from './store.js';

/** Unisce due liste di artisti eliminando i doppioni (per spotifyId o per nome). */
export function mergeArtists(manual, fromSpotify, exclude = []) {
  const excluded = new Set(exclude.map(keyOf));
  const byKey = new Map();
  const bySpotifyId = new Map();

  const add = (entry, overrides) => {
    if (!entry?.name) return;
    const key = keyOf(entry.name);
    if (!key || excluded.has(key)) return;
    const existing = (entry.spotifyId && bySpotifyId.get(entry.spotifyId)) || byKey.get(key);
    if (existing) {
      // I campi del file manuale vincono, ma completiamo quelli mancanti.
      for (const [k, v] of Object.entries(entry)) {
        if (v != null && (overrides || existing[k] == null)) existing[k] = v;
      }
      existing.key = keyOf(existing.name);
      if (existing.spotifyId) bySpotifyId.set(existing.spotifyId, existing);
      return;
    }
    const artist = { ...entry, key };
    byKey.set(key, artist);
    if (artist.spotifyId) bySpotifyId.set(artist.spotifyId, artist);
  };

  for (const a of fromSpotify) add(a, false);
  for (const a of manual) add(a, true);
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Carica gli artisti e restituisce anche lo stato della sorgente Spotify. */
export async function loadArtists(env = process.env) {
  const manualFile = await readJson(PATHS.artists, { artists: [], exclude: [] });
  const manual = (manualFile.artists ?? []).map((a) => (typeof a === 'string' ? { name: a } : a));

  const creds = {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    refreshToken: env.SPOTIFY_REFRESH_TOKEN,
  };
  let spotify = [];
  let spotifyStatus = { enabled: false, status: 'disabled' };

  if (creds.clientId && creds.clientSecret && creds.refreshToken) {
    try {
      spotify = await fetchFollowedArtists(creds);
      await writeJson(PATHS.spotifyArtists, { updatedAt: new Date().toISOString(), artists: spotify });
      spotifyStatus = { enabled: true, status: 'ok', count: spotify.length, lastSuccess: new Date().toISOString() };
      console.log(`🎧 Spotify: ${spotify.length} artisti seguiti`);
    } catch (err) {
      // Fallback sull'ultimo elenco salvato: il sito continua a funzionare.
      const snapshot = await readJson(PATHS.spotifyArtists, { artists: [] });
      spotify = snapshot.artists ?? [];
      spotifyStatus = {
        enabled: true, status: 'error', message: err.message,
        count: spotify.length, lastSuccess: snapshot.updatedAt ?? null,
      };
      console.warn(`⚠️  Spotify non raggiungibile (${err.message}): uso l'ultimo elenco (${spotify.length} artisti)`);
    }
  } else {
    console.log('ℹ️  Secret Spotify non configurati: uso solo data/artists.json');
  }

  const artists = mergeArtists(manual, spotify, manualFile.exclude ?? []);
  return { artists, spotifyStatus };
}
