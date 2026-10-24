// Stato dell'applicazione + notifica dei cambiamenti (mini pub/sub) + sincronizzazione con l'URL,
// così una vista filtrata si può condividere copiando l'indirizzo.

export const DEFAULT_FILTERS = {
  country: '', city: '', artist: '', from: '', to: '', archive: false, followedOnly: false,
};

export const state = {
  data: null,              // risultato di loadData()
  filters: { ...DEFAULT_FILTERS },
  sort: 'asc',             // 'asc' | 'desc'
  view: 'list',            // 'map' | 'list' | 'calendar'
  followed: null,          // Set di spotifyId/chiavi degli artisti seguiti (dopo il login)
  selectedVenueId: null,
  calendarMonth: null,     // 'YYYY-MM'
  calendarDay: null,       // 'YYYY-MM-DD'
};

const listeners = new Set();

/** Registra una funzione chiamata a ogni cambio di stato. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Aggiorna lo stato e avvisa i moduli. `reason` permette ai moduli di reagire solo
 * ai cambi che li riguardano (es. la mappa ricentra solo quando cambiano i filtri).
 */
export function update(patch, reason = 'change') {
  Object.assign(state, patch);
  writeUrl();
  for (const fn of listeners) fn(state, reason);
}

/** Ordinamento predefinito: prossimi concerti dal più vicino, archivio dal più recente. */
const defaultSort = () => (state.filters.archive ? 'desc' : 'asc');

/** Legge filtri e vista dall'URL all'avvio. */
export function readUrl() {
  const p = new URLSearchParams(location.search);
  for (const k of ['country', 'city', 'artist', 'from', 'to']) state.filters[k] = p.get(k) ?? '';
  state.filters.archive = p.get('archive') === '1';
  const sort = p.get('sort');
  state.sort = sort === 'asc' || sort === 'desc' ? sort : defaultSort();
  if (['map', 'list', 'calendar'].includes(p.get('view'))) state.view = p.get('view');
}

function writeUrl() {
  const p = new URLSearchParams();
  for (const k of ['country', 'city', 'artist', 'from', 'to']) if (state.filters[k]) p.set(k, state.filters[k]);
  if (state.filters.archive) p.set('archive', '1');
  if (state.sort !== defaultSort()) p.set('sort', state.sort);
  if (state.view !== 'list') p.set('view', state.view);
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
}
