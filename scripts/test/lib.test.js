// Test unitari dei moduli di normalizzazione, deduplica e unione artisti.
// Esecuzione: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOf, countryCode, splitLocalDateTime, makeEvent } from '../lib/normalize.js';
import { dedupeEvents, isSameShow } from '../lib/dedupe.js';
import { mergeArtists } from '../lib/artists.js';
import { selectFallback } from '../lib/previous.js';

const artist = { name: 'The Cure', key: keyOf('The Cure'), spotifyId: 'abc' };
const ev = (source, venue, extra = {}) => makeEvent({
  artist, source, sourceId: '1', date: '2026-12-01', venue, ...extra,
});

test('keyOf normalizza accenti, articolo e punteggiatura', () => {
  assert.equal(keyOf('The Cure'), 'cure');
  assert.equal(keyOf('München'), 'munchen');
  assert.equal(keyOf('Simon & Garfunkel'), 'simon-and-garfunkel');
});

test('countryCode accetta codici e nomi', () => {
  assert.equal(countryCode('it'), 'IT');
  assert.equal(countryCode('Italy'), 'IT');
  assert.equal(countryCode('United States'), 'US');
  assert.equal(countryCode('United Kingdom'), 'GB');
  assert.equal(countryCode('Atlantide'), null);
});

test('splitLocalDateTime estrae data e ora', () => {
  assert.deepEqual(splitLocalDateTime('2026-11-03T20:30:00'), { date: '2026-11-03', time: '20:30' });
  assert.deepEqual(splitLocalDateTime(undefined), { date: null, time: null });
});

test('makeEvent scarta le coordinate 0,0', () => {
  const e = ev('x', { name: 'A', city: 'Roma', country: 'Italy', lat: 0, lng: 0 });
  assert.equal(e.venue.lat, null);
  assert.equal(e.venue.countryCode, 'IT');
});

test('dedupe fonde lo stesso concerto da due fonti', () => {
  const tm = ev('ticketmaster', { name: 'Unipol Forum', city: 'Assago', countryCode: 'IT', lat: 45.41, lng: 9.13, address: 'Via G. di Vittorio 6' },
    { ticketUrl: 'https://tm/1', eventUrl: 'https://tm/1', time: '21:00' });
  const bit = ev('bandsintown', { name: 'Forum di Assago', city: 'Milano', country: 'Italy', lat: 45.46, lng: 9.19 },
    { ticketUrl: 'https://bit/t', eventUrl: 'https://bit/e', time: '20:30' });
  const out = dedupeEvents([tm, bit]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].sources, ['bandsintown', 'ticketmaster']);
  assert.equal(out[0].ticketUrl, 'https://tm/1'); // priorità Ticketmaster
  assert.equal(out[0].venue.address, 'Via G. di Vittorio 6'); // locale più completo
  assert.equal(out[0].links.length, 3);
});

test('dedupe tiene separati due spettacoli distanti nell\'orario o in città diverse', () => {
  const a = ev('ticketmaster', { name: 'Club', city: 'Roma' }, { time: '16:00' });
  const b = ev('ticketmaster', { name: 'Club', city: 'Roma' }, { time: '21:00' });
  assert.equal(isSameShow(a, b), false);
  const c = ev('ticketmaster', { name: 'House of Blues', city: 'Boston' });
  const d = ev('ticketmaster', { name: 'House of Blues', city: 'Chicago' });
  assert.equal(dedupeEvents([c, d]).length, 2);
});

test('mergeArtists unisce per spotifyId o nome ed esclude', () => {
  const merged = mergeArtists(
    [{ name: 'Cure', ticketmasterId: 'K1' }, { name: 'Muse' }],
    [{ name: 'The Cure', spotifyId: 'abc' }, { name: 'Coldplay', spotifyId: 'zzz' }],
    ['coldplay'],
  );
  assert.deepEqual(merged.map((a) => a.name), ['Cure', 'Muse']);
  assert.equal(merged[0].spotifyId, 'abc');
  assert.equal(merged[0].ticketmasterId, 'K1');
});

test('selectFallback recupera solo eventi futuri della sorgente fallita', () => {
  const prev = [
    { ...ev('ticketmaster', { name: 'A', city: 'X' }), date: '2026-12-01' },
    { ...ev('bandsintown', { name: 'B', city: 'Y' }), date: '2026-12-02' },
    { ...ev('ticketmaster', { name: 'C', city: 'Z' }), date: '2026-01-01' },
  ];
  const failures = new Map([['ticketmaster', new Set([artist.key])], ['bandsintown', new Set()]]);
  const out = selectFallback(prev, failures, new Set([artist.key]), '2026-10-24');
  assert.equal(out.length, 1);
  assert.equal(out[0].venue.name, 'A');
});
