// Vista elenco: concerti raggruppati per mese, con caricamento progressivo.
import { eventCard } from './event-card.js';
import { formatMonth, esc } from './utils.js';
import { CONFIG } from './config.js';

let shown = CONFIG.listPageSize;
let lastEvents = [];

/** Raggruppa per mese e restituisce l'HTML. */
export function eventsHtml(events) {
  let html = '';
  let month = '';
  for (const e of events) {
    const m = e.date.slice(0, 7);
    if (m !== month) {
      month = m;
      html += `<h2 class="month-heading">${esc(formatMonth(e.date))}</h2>`;
    }
    html += eventCard(e);
  }
  return html;
}

/**
 * Disegna la lista. `resetPaging` riporta la paginazione all'inizio
 * (da usare quando cambiano i filtri).
 */
export function renderList(container, events, { resetPaging = false, emptyMessage } = {}) {
  if (resetPaging) shown = CONFIG.listPageSize;
  lastEvents = events;

  if (!events.length) {
    container.innerHTML = `<p class="empty">${esc(emptyMessage ?? 'Nessun concerto con questi filtri.')}</p>`;
    return;
  }
  const more = events.length - shown;
  container.innerHTML = eventsHtml(events.slice(0, shown))
    + (more > 0 ? `<button type="button" class="btn btn-ghost load-more">Mostra altri ${Math.min(more, CONFIG.listPageSize)} (di ${more})</button>` : '');

  container.querySelector('.load-more')?.addEventListener('click', () => {
    shown += CONFIG.listPageSize;
    renderList(container, lastEvents, { emptyMessage });
  });
}
