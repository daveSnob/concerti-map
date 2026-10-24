// Piè di pagina con lo stato delle sorgenti e banner di avviso (dati vecchi, errori, cache).
import { esc, formatDateTime } from './utils.js';
import { CONFIG } from './config.js';

const LABELS = { spotify: 'Spotify', ticketmaster: 'Ticketmaster', bandsintown: 'Bandsintown', songkick: 'Songkick' };
const ICONS = { ok: '✓', partial: '⚠', error: '✕' };

/** Mostra un messaggio nel banner in alto (tipo: info | warn | error). */
export function showBanner(message, type = 'info') {
  const el = document.getElementById('banner');
  el.className = `banner banner-${type}`;
  el.textContent = message;
  el.hidden = !message;
}

export function renderStatus(data) {
  const { raw, fromCache } = data;
  const footer = document.getElementById('status');

  if (!raw.generatedAt) {
    showBanner('Nessun dato ancora disponibile: avvia il workflow "Aggiorna concerti" dalla scheda Actions del repository.', 'info');
    footer.textContent = '';
    return;
  }

  const sources = Object.entries(raw.sources ?? {})
    .filter(([, s]) => s.enabled)
    .map(([name, s]) => {
      const title = s.status === 'ok' ? '' : ` title="${esc(s.message ?? '')}"`;
      const last = s.status === 'error' && s.lastSuccess ? ` (dati del ${esc(formatDateTime(s.lastSuccess))})` : '';
      return `<span class="src src-${esc(s.status)}"${title}>${ICONS[s.status] ?? ''} ${esc(LABELS[name] ?? name)}${last}</span>`;
    });

  footer.innerHTML = `Aggiornato il ${esc(formatDateTime(raw.generatedAt))}`
    + (sources.length ? ` · ${sources.join(' · ')}` : '')
    + ' · Mappa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  const ageDays = (Date.now() - Date.parse(raw.generatedAt)) / 86400000;
  const failing = Object.entries(raw.sources ?? {}).filter(([, s]) => s.status === 'error').map(([n]) => LABELS[n] ?? n);
  if (fromCache) {
    showBanner('Connessione non disponibile: stai vedendo l\'ultima copia dei dati salvata nel browser.', 'warn');
  } else if (ageDays > CONFIG.staleAfterDays) {
    showBanner(`I dati non vengono aggiornati da ${Math.floor(ageDays)} giorni: controlla il workflow su GitHub.`, 'warn');
  } else if (failing.length) {
    showBanner(`${failing.join(', ')} non ha risposto all'ultimo aggiornamento: per questa fonte sono mostrati i dati precedenti.`, 'warn');
  }
}
