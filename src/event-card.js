// Markup di un singolo concerto, riusato da lista, calendario e pannello del locale.
import { esc, safeUrl, flag, countryName, parseDate } from './utils.js';

const SOURCE_LABELS = { ticketmaster: 'Ticketmaster', bandsintown: 'Bandsintown', songkick: 'Songkick' };
const STATUS_LABELS = { postponed: 'Rinviato', rescheduled: 'Riprogrammato', offsale: 'Vendita chiusa' };

const dayFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric' });
const monFmt = new Intl.DateTimeFormat('it-IT', { month: 'short' });
const wdFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });

/** Pulsanti "Biglietti" ed "Evento" (più i link secondari delle altre fonti). */
export function linksHtml(e) {
  const out = [];
  const ticket = safeUrl(e.ticketUrl);
  const page = safeUrl(e.eventUrl);
  if (ticket) out.push(`<a class="btn btn-primary btn-small" href="${esc(ticket)}" target="_blank" rel="noopener">Biglietti</a>`);
  if (page && page !== ticket) out.push(`<a class="btn btn-ghost btn-small" href="${esc(page)}" target="_blank" rel="noopener">Evento</a>`);
  // Link aggiuntivi da altre fonti (dopo la deduplica un concerto può averne diversi).
  for (const l of e.links ?? []) {
    const url = safeUrl(l.url);
    if (!url || url === ticket || url === page) continue;
    const label = `${SOURCE_LABELS[l.source] ?? l.source}${l.type === 'tickets' ? ' (biglietti)' : ''}`;
    out.push(`<a class="link-small" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`);
  }
  return out.join('');
}

/** Scheda completa (lista e calendario). */
export function eventCard(e) {
  const d = parseDate(e.date);
  const v = e.venue;
  const status = STATUS_LABELS[e.status] ? `<span class="tag tag-warn">${STATUS_LABELS[e.status]}</span>` : '';
  const sources = (e.sources ?? []).map((s) => SOURCE_LABELS[s] ?? s).join(', ');
  return `
    <article class="event-card${e.past ? ' is-past' : ''}">
      <div class="date-badge" aria-hidden="true">
        <span class="wd">${wdFmt.format(d)}</span>
        <span class="day">${dayFmt.format(d)}</span>
        <span class="mon">${monFmt.format(d)} ${d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() : ''}</span>
      </div>
      <div class="event-body">
        <h3 class="event-artist">${esc(e.artist)} ${status}</h3>
        <button type="button" class="venue-link" data-venue="${esc(v.id)}">
          ${esc(v.name)}
        </button>
        <p class="event-meta">
          ${flag(v.countryCode)} ${esc(v.city ?? '')}${v.city ? ', ' : ''}${esc(countryName(v.countryCode, v.country))}
          ${e.time ? ` · ore ${esc(e.time)}` : ''}
        </p>
        <div class="event-actions">${linksHtml(e)}</div>
        <p class="event-sources">Fonte: ${esc(sources)}</p>
      </div>
    </article>`;
}
