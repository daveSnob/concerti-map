// Test end-to-end della pipeline: esegue fetch-events.js con fetch simulato
// su una cartella dati temporanea e controlla il events.json prodotto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const here = fileURLToPath(new URL('.', import.meta.url));
const script = join(here, '..', 'fetch-events.js');
const mock = pathToFileURL(join(here, 'fixtures', 'mock-fetch.js')).href;
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test('pipeline: normalizza, geocodifica, recupera la sorgente fallita, archivia', { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concerti-'));
  await writeFile(join(dir, 'artists.json'), JSON.stringify({
    artists: [{ name: 'The Cure', spotifyId: '7bu3H8JO7d0UbMoVzbo70s' }],
  }));
  // File precedente: un evento futuro da Bandsintown (che ora fallisce) e uno passato.
  await writeFile(join(dir, 'events.json'), JSON.stringify({
    sources: { bandsintown: { lastSuccess: '2026-01-01T00:00:00Z' } },
    venues: [{ id: 'v-old', name: 'Paradiso', city: 'Amsterdam', countryCode: 'NL', lat: 52.36, lng: 4.88 }],
    events: [
      { id: 'e1', artist: 'The Cure', artistKey: 'cure', date: inDays(50), venueId: 'v-old', sources: ['bandsintown'], links: [] },
      { id: 'e2', artist: 'The Cure', artistKey: 'cure', date: inDays(-20), venueId: 'v-old', sources: ['ticketmaster'], links: [] },
    ],
  }));

  await run(process.execPath, ['--import', mock, script], {
    env: { ...process.env, DATA_DIR: dir, TICKETMASTER_API_KEY: 'k', BANDSINTOWN_APP_ID: 'a', SONGKICK_API_KEY: '' },
  });
  const out = JSON.parse(await readFile(join(dir, 'events.json'), 'utf8'));

  assert.equal(out.sources.ticketmaster.status, 'ok');
  assert.equal(out.sources.bandsintown.status, 'error');
  assert.equal(out.sources.bandsintown.lastSuccess, '2026-01-01T00:00:00Z');
  assert.equal(out.sources.songkick.status, 'disabled');

  // 2 eventi Ticketmaster (il parcheggio è escluso) + 1 recuperato + 1 in archivio
  assert.equal(out.events.length, 4);
  const venueOf = (e) => out.venues.find((v) => v.id === e.venueId);
  const berlin = out.events.find((e) => venueOf(e).city === 'Berlin');
  assert.equal(venueOf(berlin).approximate, true);
  assert.equal(venueOf(berlin).lat, 52.52);
  const forum = out.events.find((e) => venueOf(e).name === 'Unipol Forum');
  assert.equal(forum.time, '21:00');
  assert.equal(forum.ticketUrl, 'https://www.ticketmaster.it/event/tm1');
  assert.ok(out.events.some((e) => e.date === inDays(-20)), 'evento passato conservato in archivio');
  assert.ok(out.events.some((e) => e.date === inDays(50) && e.sources.includes('bandsintown')), 'fallback Bandsintown');

  // La cache degli id deve contenere l'attraction giusta (match via link Spotify, non l'omonimo).
  const ids = JSON.parse(await readFile(join(dir, 'cache', 'source-ids.json'), 'utf8'));
  assert.equal(ids.ticketmaster.cure.id, 'K8vZ917');
});
