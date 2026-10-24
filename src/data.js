// Caricamento di data/events.json e preparazione degli indici usati dalle viste.
import { storage, todayLocal } from './utils.js';

const CACHE_KEY = 'concerti:last-events';

/**
 * Scarica events.json. Se la rete fallisce usa l'ultima copia salvata nel browser,
 * così il sito resta utilizzabile anche offline o con GitHub Pages momentaneamente giù.
 */
export async function loadData() {
  let raw;
  let fromCache = false;
  try {
    const res = await fetch('data/events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
    storage.set(CACHE_KEY, JSON.stringify(raw));
  } catch (err) {
    const cached = storage.get(CACHE_KEY);
    if (!cached) throw new Error(`Impossibile caricare i concerti (${err.message}).`);
    raw = JSON.parse(cached);
    fromCache = true;
  }
  return prepare(raw, fromCache);
}

/** Collega ogni evento al suo locale e separa futuri e passati. */
export function prepare(raw, fromCache = false) {
  const venues = new Map((raw.venues ?? []).map((v) => [v.id, v]));
  const today = todayLocal();
  const events = (raw.events ?? [])
    .filter((e) => venues.has(e.venueId))
    .map((e) => ({ ...e, venue: venues.get(e.venueId), past: e.date < today }));

  return {
    raw,
    fromCache,
    today,
    venues,
    events,
    upcoming: events.filter((e) => !e.past),
    past: events.filter((e) => e.past),
  };
}
