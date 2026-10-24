// Lettura/scrittura dei file JSON nella cartella data/.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Radice del repository (due livelli sopra scripts/lib). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// La cartella dei dati si può cambiare con DATA_DIR (usato dai test).
const DATA = process.env.DATA_DIR ?? join(ROOT, 'data');

/** Percorsi dei file di dati usati dalla pipeline. */
export const PATHS = {
  artists: join(DATA, 'artists.json'),                 // lista modificabile a mano
  spotifyArtists: join(DATA, 'spotify-artists.json'),  // ultimo elenco valido da Spotify
  events: join(DATA, 'events.json'),                   // file letto dal frontend
  geocache: join(DATA, 'cache', 'geocode.json'),       // cache di Nominatim
  sourceIds: join(DATA, 'cache', 'source-ids.json'),   // id artista per ogni API
};

/** Legge un JSON; se il file manca o è corrotto restituisce `fallback`. */
export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`⚠️  Impossibile leggere ${path}: ${err.message}`);
    return fallback;
  }
}

/**
 * Scrive un JSON in modo atomico (file temporaneo + rename),
 * così un errore a metà scrittura non lascia mai un file troncato.
 */
export async function writeJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
