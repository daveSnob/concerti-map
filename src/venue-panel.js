// Pannello di dettaglio di un locale: indirizzo completo e tutte le date (con i filtri attivi).
import { update } from './state.js';
import { linksHtml } from './event-card.js';
import { esc, flag, countryName, formatDateShort, safeUrl } from './utils.js';

const panel = () => document.getElementById('venue-panel');

export function closeVenuePanel() {
  update({ selectedVenueId: null }, 'venue');
}

/**
 * @param venue oggetto locale (o null per chiudere)
 * @param events concerti del locale che rispettano i filtri correnti
 * @param hiddenCount concerti del locale esclusi dai filtri (artista, date...)
 */
export function renderVenuePanel(venue, events, hiddenCount = 0) {
  const el = panel();
  if (!venue) { el.hidden = true; el.innerHTML = ''; return; }

  const v = venue;
  const addressLine = [v.address, [v.postalCode, v.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const osm = v.lat != null
    ? safeUrl(`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=17/${v.lat}/${v.lng}`)
    : null;

  const rows = events.map((e) => `
    <li class="venue-event">
      <div class="venue-event-head">
        <span class="venue-event-date">${esc(formatDateShort(e.date))}${e.time ? ` · ${esc(e.time)}` : ''}</span>
        <strong class="venue-event-artist">${esc(e.artist)}</strong>
      </div>
      <div class="event-actions">${linksHtml(e) || '<span class="muted">Nessun link disponibile</span>'}</div>
    </li>`).join('');

  el.innerHTML = `
    <div class="panel-handle" aria-hidden="true"></div>
    <header class="panel-header">
      <div>
        <h2 class="panel-title" tabindex="-1">${esc(v.name)}</h2>
        <p class="panel-sub">${flag(v.countryCode)} ${esc(v.city ?? 'Città sconosciuta')}, ${esc(countryName(v.countryCode, v.country))}</p>
      </div>
      <button type="button" class="btn btn-icon" data-close aria-label="Chiudi">✕</button>
    </header>
    <dl class="venue-details">
      <dt>Indirizzo</dt><dd>${esc(addressLine || 'Indirizzo non disponibile')}</dd>
      ${v.region ? `<dt>Regione</dt><dd>${esc(v.region)}</dd>` : ''}
      <dt>Città</dt><dd>${esc(v.city ?? '—')}</dd>
      <dt>Nazione</dt><dd>${esc(countryName(v.countryCode, v.country))}</dd>
    </dl>
    ${v.approximate ? '<p class="note">📍 Indirizzo incompleto: la posizione sulla mappa è quella della città.</p>' : ''}
    ${v.lat == null ? '<p class="note">📍 Posizione non disponibile: il locale non compare sulla mappa.</p>' : ''}
    ${osm ? `<p><a class="link-small" href="${esc(osm)}" target="_blank" rel="noopener">Apri in OpenStreetMap ↗</a></p>` : ''}
    <h3 class="panel-section">${events.length} ${events.length === 1 ? 'data' : 'date'}</h3>
    <ul class="venue-events">${rows || '<li class="empty">Nessuna data con i filtri attuali.</li>'}</ul>
    ${hiddenCount ? `<p class="muted">${hiddenCount} altre date nascoste dai filtri.</p>` : ''}`;

  el.hidden = false;
  el.querySelector('[data-close]').addEventListener('click', closeVenuePanel);
  el.querySelector('.panel-title').focus?.();
}

/** Chiusura con il tasto Esc. */
export function initVenuePanel() {
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !panel().hidden) closeVenuePanel();
  });
}
