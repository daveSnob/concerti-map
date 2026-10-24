// Punto di ingresso: carica i dati, inizializza i moduli e ridisegna le viste a ogni cambio di stato.
import { state, update, subscribe, readUrl } from './state.js';
import { loadData } from './data.js';
import { initFilters, renderFilterOptions, applyFilters, sortEvents } from './filters.js';
import { initMap, renderMap, selectVenue, refreshMapSize } from './map.js';
import { renderList } from './list.js';
import { renderCalendar } from './calendar.js';
import { initVenuePanel, renderVenuePanel } from './venue-panel.js';
import { initTheme } from './theme.js';
import { renderStatus, showBanner } from './status.js';
import * as spotify from './spotify.js';
import { openSpotifyPanel } from './spotify-panel.js';

const $ = (id) => document.getElementById(id);
const isDesktop = () => matchMedia('(min-width: 900px)').matches;

/** Ridisegna ciò che serve in base al motivo del cambiamento. */
function render(s, reason) {
  const filtered = sortEvents(applyFilters(s), s.sort);
  const filtersChanged = ['init', 'filters', 'followed'].includes(reason);

  if (reason !== 'venue' && reason !== 'calendar') renderFilterOptions(s);

  // Riepilogo risultati
  const venues = new Set(filtered.map((e) => e.venueId)).size;
  $('results-summary').textContent = `${filtered.length} ${filtered.length === 1 ? 'concerto' : 'concerti'}`
    + ` in ${venues} ${venues === 1 ? 'locale' : 'locali'}${s.filters.archive ? ' (archivio)' : ''}`;
  $('sort-btn').textContent = s.sort === 'asc' ? 'Data ↑' : 'Data ↓';

  // Mappa: ricentra solo quando cambiano i filtri
  if (filtersChanged) {
    const missing = renderMap(filtered, { fit: true });
    $('map-note').hidden = missing === 0;
    $('map-note').textContent = `${missing} ${missing === 1 ? 'concerto' : 'concerti'} senza posizione (visibili nella lista)`;
  }

  // Vista attiva (su desktop la mappa è sempre visibile e la colonna mostra lista o calendario)
  document.body.dataset.view = s.view;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === s.view)));
  const showCalendar = s.view === 'calendar';
  if (showCalendar) {
    renderCalendar($('calendar-view'), sortEvents(filtered, 'asc'));
  } else if (reason !== 'venue' && reason !== 'calendar') {
    renderList($('list-view'), filtered, {
      resetPaging: filtersChanged,
      emptyMessage: s.data.events.length ? 'Nessun concerto con questi filtri.' : 'Nessun concerto disponibile.',
    });
  }
  if (reason === 'view') setTimeout(refreshMapSize, 50);

  // Pannello del locale
  const venue = s.selectedVenueId ? s.data.venues.get(s.selectedVenueId) : null;
  if (venue) {
    const atVenue = filtered.filter((e) => e.venueId === venue.id);
    const base = s.filters.archive ? s.data.past : s.data.upcoming;
    const total = base.filter((e) => e.venueId === venue.id).length;
    renderVenuePanel(venue, sortEvents(atVenue, s.sort), total - atVenue.length);
  } else {
    renderVenuePanel(null);
  }
  // Su desktop il pannello affianca la mappa invece di coprirla.
  if (document.body.classList.contains('panel-open') !== Boolean(venue)) {
    document.body.classList.toggle('panel-open', Boolean(venue));
    refreshMapSize();
  }
  if (reason === 'venue' || filtersChanged) selectVenue(s.selectedVenueId, { pan: reason === 'venue' });
}

/** Tab (Mappa/Lista/Calendario), ordinamento e clic sui nomi dei locali. */
function initControls() {
  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => update({ view: tab.dataset.view }, 'view')));

  $('sort-btn').addEventListener('click', () => update({ sort: state.sort === 'asc' ? 'desc' : 'asc' }, 'sort'));

  // Clic sul nome di un locale in lista/calendario: apre il pannello e lo mostra sulla mappa.
  document.querySelector('.sidebar').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-venue]');
    if (!btn) return;
    const patch = { selectedVenueId: btn.dataset.venue };
    if (!isDesktop()) patch.view = 'map';
    update(patch, patch.view ? 'view' : 'venue');
    if (patch.view) setTimeout(() => selectVenue(btn.dataset.venue), 100);
  });

  // Su desktop la vista "map" non ha senso: si torna alla lista.
  matchMedia('(min-width: 900px)').addEventListener('change', (m) => {
    if (m.matches && state.view === 'map') update({ view: 'list' }, 'view');
    refreshMapSize();
  });
}

/** Login Spotify opzionale: abilita il filtro "solo artisti che seguo". */
async function initSpotify(redirectError) {
  if (!spotify.isConfigured()) return;
  const btn = $('spotify-btn');
  btn.hidden = false;
  if (redirectError) showBanner(redirectError, 'error');

  if (!spotify.getToken()) {
    btn.addEventListener('click', () => spotify.login());
    return;
  }
  try {
    btn.textContent = 'Spotify…';
    const followed = await spotify.fetchFollowedArtists();
    btn.textContent = `Spotify ✓ ${followed.length}`;
    btn.title = 'Artisti seguiti su Spotify';
    btn.addEventListener('click', () => openSpotifyPanel(followed, state.data.raw.artists ?? []));
    update({ followed: spotify.followedSet(followed) }, 'followed');
  } catch (err) {
    showBanner(err.message, 'error');
    btn.textContent = 'Accedi con Spotify';
    btn.addEventListener('click', () => spotify.login());
  }
}

async function main() {
  initTheme();
  // Il ritorno dal login Spotify va gestito prima di leggere i filtri dall'URL,
  // perché ripristina l'indirizzo che c'era prima del login.
  let spotifyError = null;
  if (spotify.isConfigured()) {
    spotifyError = await spotify.handleRedirect().catch((err) => `Login Spotify fallito: ${err.message}`);
  }
  readUrl();
  if (isDesktop() && state.view === 'map') state.view = 'list';
  // Su smartphone i filtri partono chiusi per lasciare spazio ai risultati.
  if (!isDesktop()) $('filters-box').open = false;

  try {
    state.data = await loadData();
  } catch (err) {
    showBanner(err.message, 'error');
    return;
  }
  renderStatus(state.data);

  initFilters();
  initControls();
  initVenuePanel();
  initMap((venueId) => update({ selectedVenueId: venueId }, 'venue'));
  subscribe(render);
  update({}, 'init');

  initSpotify(spotifyError);
}

main();
