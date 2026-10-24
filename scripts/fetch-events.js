#!/usr/bin/env node
// Script di aggiornamento eseguito dalla GitHub Action (o a mano con `npm run fetch`).
//
// Passi:
//  1. legge gli artisti (data/artists.json + Spotify, se configurato);
//  2. interroga in parallelo le sorgenti di eventi abilitate (una per secret presente);
//  3. se una sorgente fallisce, recupera i suoi eventi dal precedente events.json;
//  4. deduplica, conserva l'archivio degli eventi passati, geocodifica i locali;
//  5. scrive data/events.json.
//
// Variabili d'ambiente (secret del repository):
//   TICKETMASTER_API_KEY, BANDSINTOWN_APP_ID, SONGKICK_API_KEY   -> sorgenti eventi
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN -> artisti seguiti
//   NOMINATIM_EMAIL   -> contatto inviato a Nominatim (consigliato)
//   ARCHIVE_DAYS      -> giorni di archivio da conservare (predefinito 365)
import { loadArtists } from './lib/artists.js';
import { SOURCES } from './lib/sources/index.js';
import { FatalSourceError } from './lib/sources/errors.js';
import { createSourceIdCache } from './lib/source-ids.js';
import { createGeocoder } from './lib/geocode.js';
import { dedupeEvents } from './lib/dedupe.js';
import { buildVenues } from './lib/venues.js';
import { expandPrevious, selectFallback, selectArchive } from './lib/previous.js';
import { todayIso, addDays } from './lib/normalize.js';
import { PATHS, readJson, writeJson } from './lib/store.js';

const env = process.env;
const ARCHIVE_DAYS = Number.parseInt(env.ARCHIVE_DAYS ?? '365', 10);

/** Interroga una sorgente per tutti gli artisti, senza mai lanciare eccezioni. */
async function runSource(source, artists, ctx, previousStatus) {
  const status = { enabled: true, status: 'ok', events: 0, errors: 0 };
  const failed = new Set();
  const events = [];

  for (const artist of artists) {
    try {
      const found = await source.fetchArtistEvents(artist, ctx);
      events.push(...found);
      status.events += found.length;
    } catch (err) {
      if (err instanceof FatalSourceError) {
        // Chiave errata o quota esaurita: inutile proseguire con questa sorgente.
        console.error(`❌ ${source.name}: ${err.message}`);
        return {
          events: [],
          failures: 'all',
          status: { ...status, status: 'error', message: err.message, lastSuccess: previousStatus?.lastSuccess ?? null },
        };
      }
      failed.add(artist.key);
      status.errors += 1;
      console.warn(`⚠️  ${source.name} / ${artist.name}: ${err.message}`);
    }
  }

  const allFailed = artists.length > 0 && failed.size === artists.length;
  status.status = allFailed ? 'error' : failed.size ? 'partial' : 'ok';
  status.lastSuccess = allFailed ? previousStatus?.lastSuccess ?? null : new Date().toISOString();
  if (failed.size) status.message = `${failed.size} artisti non aggiornati: mostrati i dati precedenti`;
  console.log(`✅ ${source.name}: ${status.events} eventi, ${status.errors} errori`);
  return { events, failures: allFailed ? 'all' : failed, status };
}

async function main() {
  const now = new Date();
  const today = todayIso(now);
  const previous = await readJson(PATHS.events, null);
  const prevEvents = expandPrevious(previous);

  // 1. Artisti
  const { artists, spotifyStatus } = await loadArtists(env);
  console.log(`🎤 Artisti monitorati: ${artists.length}`);
  if (artists.length === 0 && prevEvents.length > 0 && spotifyStatus.status === 'error') {
    console.error('❌ Nessun artista disponibile e Spotify in errore: lascio invariato events.json.');
    return;
  }

  // 2. Sorgenti di eventi (in parallelo tra loro; ognuna ha il proprio throttling)
  const ids = await createSourceIdCache();
  const ctx = { env, ids };
  const enabled = SOURCES.filter((s) => s.isEnabled(env));
  if (enabled.length === 0) {
    console.warn('⚠️  Nessuna sorgente configurata (es. secret TICKETMASTER_API_KEY): mantengo i dati precedenti.');
  }
  const results = await Promise.all(enabled.map((s) => runSource(s, artists, ctx, previous?.sources?.[s.name])));
  await ids.save();

  const sources = { spotify: spotifyStatus };
  const failures = new Map();
  const fresh = [];
  for (const s of SOURCES) {
    const i = enabled.indexOf(s);
    if (i === -1) {
      sources[s.name] = { enabled: false, status: 'disabled' };
      // Sorgente disattivata: i suoi eventi futuri del file precedente vengono mantenuti
      // solo se non ci sono sorgenti attive (altrimenti spariscono, come previsto).
      if (enabled.length === 0) failures.set(s.name, 'all');
      continue;
    }
    sources[s.name] = results[i].status;
    failures.set(s.name, results[i].failures);
    fresh.push(...results[i].events);
  }

  // 3. Ultimo dato valido + archivio
  const artistKeys = new Set(artists.map((a) => a.key));
  const fallback = selectFallback(prevEvents, failures, artistKeys, today);
  const oldest = addDays(today, -ARCHIVE_DAYS);
  const archive = selectArchive(prevEvents, today, oldest);
  if (fallback.length) console.log(`♻️  Recuperati ${fallback.length} eventi dal file precedente`);

  // 4. Deduplica, filtro date, geocodifica
  const merged = dedupeEvents([...fresh, ...fallback, ...archive]).filter((e) => e.date >= oldest);
  const repo = env.GITHUB_REPOSITORY ? `https://github.com/${env.GITHUB_REPOSITORY}` : 'local';
  if (!env.NOMINATIM_EMAIL) console.warn('ℹ️  NOMINATIM_EMAIL non impostata: consigliata dalla policy di Nominatim.');
  const geocoder = await createGeocoder({
    userAgent: `concerti-map/1.0 (+${repo}${env.NOMINATIM_EMAIL ? `; ${env.NOMINATIM_EMAIL}` : ''})`,
  });
  const { venues, events } = await buildVenues(merged, geocoder);
  await geocoder.save();
  console.log(`🌍 Nominatim: ${geocoder.requests} nuove richieste`);

  events.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')) || a.artist.localeCompare(b.artist));
  venues.sort((a, b) => a.id.localeCompare(b.id));

  // 5. Output
  await writeJson(PATHS.events, {
    version: 1,
    generatedAt: now.toISOString(),
    archiveDays: ARCHIVE_DAYS,
    sources,
    artists: artists.map(({ name, key, spotifyId }) => ({ name, key, spotifyId: spotifyId ?? null })),
    venues,
    events,
  });
  const upcoming = events.filter((e) => e.date >= today).length;
  console.log(`💾 Salvati ${events.length} eventi (${upcoming} futuri) in ${venues.length} locali`);
}

main().catch((err) => {
  // Errore imprevisto: l'Action fallisce, nessun commit, il sito continua a mostrare
  // l'ultimo events.json valido.
  console.error(err);
  process.exit(1);
});
