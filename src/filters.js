// Filtri combinabili (nazione, città, artista, intervallo date, archivio, solo seguiti).
// Le opzioni delle tendine sono "a faccette": mostrano solo i valori compatibili con
// gli altri filtri attivi, con il numero di concerti tra parentesi.
import { state, update, DEFAULT_FILTERS } from './state.js';
import { keyOf, countryName, flag, collator, esc } from './utils.js';

const UNKNOWN = '??';
const countryOf = (e) => e.venue.countryCode ?? UNKNOWN;
const cityOf = (e) => keyOf(e.venue.city) || UNKNOWN;

/** Vero se l'evento è di un artista seguito su Spotify (per id o per nome). */
export function isFollowed(e, followed) {
  return followed.has(e.spotifyId) || followed.has(e.artistKey);
}

/** Applica i filtri; `skip` esclude alcuni filtri (serve per calcolare le faccette). */
export function applyFilters(s, skip = []) {
  const f = s.filters;
  const base = f.archive ? s.data.past : s.data.upcoming;
  const use = (k) => f[k] && !skip.includes(k);
  return base.filter((e) =>
    (!use('country') || countryOf(e) === f.country)
    && (!use('city') || cityOf(e) === f.city)
    && (!use('artist') || e.artistKey === f.artist)
    && (!use('from') || e.date >= f.from)
    && (!use('to') || e.date <= f.to)
    && (!f.followedOnly || !s.followed || isFollowed(e, s.followed)));
}

/** Ordina per data e ora (crescente o decrescente). */
export function sortEvents(events, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return [...events].sort((a, b) =>
    sign * `${a.date}${a.time ?? '99:99'}`.localeCompare(`${b.date}${b.time ?? '99:99'}`)
    || collator.compare(a.artist, b.artist));
}

/** Conta le occorrenze per valore, ricordando anche un'etichetta leggibile. */
function facet(events, valueOf, labelOf) {
  const map = new Map();
  for (const e of events) {
    const v = valueOf(e);
    const item = map.get(v) ?? { value: v, label: labelOf(e), count: 0 };
    item.count += 1;
    map.set(v, item);
  }
  return [...map.values()].sort((a, b) => collator.compare(a.label, b.label));
}

function optionsHtml(items, selected, allLabel) {
  // Il valore selezionato resta sempre in elenco, anche se ora ha 0 risultati.
  if (selected && !items.some((i) => i.value === selected)) {
    items = [{ value: selected, label: selected === UNKNOWN ? 'Sconosciuta' : selected, count: 0 }, ...items];
  }
  return [`<option value="">${esc(allLabel)}</option>`]
    .concat(items.map((i) => `<option value="${esc(i.value)}"${i.value === selected ? ' selected' : ''}>`
      + `${esc(i.label)} (${i.count})</option>`))
    .join('');
}

/** Aggiorna il contenuto delle tendine in base allo stato corrente. */
export function renderFilterOptions(s) {
  const form = document.getElementById('filters');
  const f = s.filters;

  form.country.innerHTML = optionsHtml(
    facet(applyFilters(s, ['country', 'city']), countryOf,
      (e) => `${flag(e.venue.countryCode)} ${countryName(e.venue.countryCode, e.venue.country)}`.trim()),
    f.country, 'Tutte le nazioni');

  form.city.innerHTML = optionsHtml(
    facet(applyFilters(s, ['city']), cityOf, (e) => e.venue.city ?? 'Città sconosciuta'),
    f.city, 'Tutte le città');

  form.artist.innerHTML = optionsHtml(
    facet(applyFilters(s, ['artist']), (e) => e.artistKey, (e) => e.artist),
    f.artist, 'Tutti gli artisti');

  form.from.value = f.from;
  form.to.value = f.to;
  form.archive.checked = f.archive;
  form.followedOnly.checked = f.followedOnly;
  document.getElementById('followed-only-wrap').hidden = !s.followed;

  const active = ['country', 'city', 'artist', 'from', 'to', 'followedOnly'].filter((k) => f[k]).length;
  const pill = document.getElementById('filter-count');
  pill.hidden = active === 0;
  pill.textContent = String(active);
}

/** Collega gli eventi del form allo stato. */
export function initFilters() {
  const form = document.getElementById('filters');

  form.addEventListener('change', (ev) => {
    const name = ev.target.name;
    const filters = { ...state.filters };
    filters[name] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    if (name === 'country') filters.city = ''; // la città dipende dalla nazione
    const patch = { filters, calendarDay: null };
    // In archivio ha più senso vedere prima i concerti più recenti.
    if (name === 'archive') patch.sort = filters.archive ? 'desc' : 'asc';
    update(patch, 'filters');
  });

  form.addEventListener('reset', (ev) => {
    ev.preventDefault();
    update({ filters: { ...DEFAULT_FILTERS }, sort: 'asc', calendarDay: null }, 'filters');
  });
}
