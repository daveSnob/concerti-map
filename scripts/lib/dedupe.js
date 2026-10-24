// Deduplica degli eventi che arrivano da più fonti (o dalla stessa fonte due volte).
//
// Regola: due eventi sono lo stesso concerto se hanno
//   - lo stesso artista (chiave normalizzata) e la stessa data, e
//   - la stessa città (chiave normalizzata) OPPURE coordinate entro 25 km
//     (OPPURE stesso nome del locale, se una delle due città manca),
//   - e orari compatibili (se entrambi noti, distanti meno di 2 ore: così due
//     spettacoli nella stessa sera, ad es. pomeridiano e serale, restano separati).
import { keyOf, distanceKm } from './normalize.js';
import { TICKET_PRIORITY } from './sources/index.js';

const SAME_PLACE_KM = 25;
const SAME_SHOW_MINUTES = 120;

function minutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Vero se a e b (stesso artista e data) sono lo stesso concerto. */
export function isSameShow(a, b) {
  const cityA = keyOf(a.venue.city);
  const cityB = keyOf(b.venue.city);
  const sameCity = cityA && cityA === cityB;
  const hasCoords = a.venue.lat != null && b.venue.lat != null;
  const near = hasCoords && distanceKm(a.venue, b.venue) <= SAME_PLACE_KM;
  // Il solo nome del locale basta solo se manca una delle due città
  // (catene come "House of Blues" esistono in molte città).
  const sameVenueName = keyOf(a.venue.name) === keyOf(b.venue.name) && (!cityA || !cityB);
  if (!sameCity && !near && !sameVenueName) return false;
  if (a.time && b.time && Math.abs(minutes(a.time) - minutes(b.time)) >= SAME_SHOW_MINUTES) return false;
  return true;
}

/** Conta quanti campi utili ha un locale: serve a scegliere la versione più completa. */
function venueScore(v) {
  return ['address', 'postalCode', 'city', 'region', 'countryCode', 'lat'].filter((k) => v[k] != null).length;
}

function sourceRank(source) {
  const i = TICKET_PRIORITY.indexOf(source);
  return i === -1 ? 99 : i;
}

/** Fonde b dentro a (a viene modificato e restituito). */
export function mergeInto(a, b) {
  // Locale: teniamo il più completo e riempiamo i buchi con l'altro.
  const [best, other] = venueScore(b.venue) > venueScore(a.venue) ? [b.venue, a.venue] : [a.venue, b.venue];
  a.venue = { ...best };
  for (const [k, v] of Object.entries(other)) if (a.venue[k] == null && v != null) a.venue[k] = v;

  for (const k of ['time', 'timezone', 'status', 'title', 'spotifyId', 'eventUrl']) {
    if (a[k] == null && b[k] != null) a[k] = b[k];
  }

  // Link al biglietto: vince la fonte con priorità più alta.
  const tickets = [...a.links, ...b.links].filter((l) => l.type === 'tickets')
    .sort((x, y) => sourceRank(x.source) - sourceRank(y.source));
  a.ticketUrl = tickets[0]?.url ?? a.ticketUrl ?? b.ticketUrl ?? null;

  const seen = new Set();
  a.links = [...a.links, ...b.links].filter((l) => !seen.has(l.url) && seen.add(l.url));
  a.sources = [...new Set([...a.sources, ...b.sources])].sort();
  return a;
}

/** Restituisce la lista di eventi senza doppioni. Non modifica l'array di input. */
export function dedupeEvents(events) {
  const groups = new Map();
  for (const ev of events) {
    const groupKey = `${ev.artistKey}|${ev.date}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    const group = groups.get(groupKey);
    const copy = structuredClone(ev);
    const dup = group.find((g) => isSameShow(g, copy));
    if (dup) mergeInto(dup, copy);
    else group.push(copy);
  }
  return [...groups.values()].flat();
}
