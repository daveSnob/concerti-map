// Vista calendario: griglia mensile (lunedì come primo giorno) con il numero di concerti
// per giorno. Cliccando un giorno si vedono i suoi concerti sotto la griglia.
import { state, update } from './state.js';
import { eventsHtml } from './list.js';
import { formatMonth, formatDateLong, esc, todayLocal } from './utils.js';

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const pad = (n) => String(n).padStart(2, '0');

/** Sposta un mese 'YYYY-MM' di `delta` mesi. */
function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function renderCalendar(container, events) {
  // Mese iniziale: quello del primo concerto in elenco, altrimenti il mese corrente.
  const month = state.calendarMonth ?? (events[0]?.date ?? todayLocal()).slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0 = lunedì

  const perDay = new Map();
  for (const e of events) {
    if (e.date.startsWith(month)) perDay.set(e.date, (perDay.get(e.date) ?? 0) + 1);
  }
  const today = todayLocal();

  let cells = '<div class="cal-cell is-empty"></div>'.repeat(offset);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${pad(d)}`;
    const n = perDay.get(iso) ?? 0;
    const cls = ['cal-cell', n && 'has-events', iso === today && 'is-today', iso === state.calendarDay && 'is-selected']
      .filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" data-day="${iso}" ${n ? '' : 'disabled'}
      aria-label="${esc(formatDateLong(iso))}: ${n} concerti">
      <span class="cal-num">${d}</span>${n ? `<span class="cal-count">${n}</span>` : ''}</button>`;
  }

  const day = state.calendarDay;
  const listed = day ? events.filter((e) => e.date === day) : events.filter((e) => e.date.startsWith(month));
  const title = day ? formatDateLong(day) : `Tutti i concerti di ${formatMonth(`${month}-01`)}`;

  container.innerHTML = `
    <div class="cal-header">
      <button type="button" class="btn btn-icon" data-shift="-1" aria-label="Mese precedente">‹</button>
      <h2 class="cal-title">${esc(formatMonth(`${month}-01`))}</h2>
      <button type="button" class="btn btn-icon" data-shift="1" aria-label="Mese successivo">›</button>
    </div>
    <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join('')}${cells}</div>
    <div class="cal-list">
      <h3 class="cal-list-title">${esc(title)}
        ${day ? '<button type="button" class="link-small" data-clear-day>mostra tutto il mese</button>' : ''}</h3>
      ${listed.length ? eventsHtml(listed) : '<p class="empty">Nessun concerto in questo periodo.</p>'}
    </div>`;

  container.querySelectorAll('[data-shift]').forEach((b) => b.addEventListener('click', () =>
    update({ calendarMonth: shiftMonth(month, Number(b.dataset.shift)), calendarDay: null }, 'calendar')));
  container.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () =>
    update({ calendarMonth: month, calendarDay: b.dataset.day === day ? null : b.dataset.day }, 'calendar')));
  container.querySelector('[data-clear-day]')?.addEventListener('click', () => update({ calendarDay: null }, 'calendar'));
}
