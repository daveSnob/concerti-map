// Piccole funzioni di utilità condivise dai moduli del frontend.

/** Escape dell'HTML: tutti i dati esterni passano da qui prima di finire nel DOM. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Accetta solo URL http(s): evita link "javascript:" provenienti dai dati. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Stessa normalizzazione dei nomi usata dallo script di aggiornamento. */
export function keyOf(str) {
  return String(str ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/^the /, '').replace(/ /g, '-');
}

/** Data locale di oggi in formato YYYY-MM-DD. */
export function todayLocal(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Crea una Date "a mezzogiorno" da YYYY-MM-DD (evita slittamenti di fuso). */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

const fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

export const formatDateLong = (iso) => fmtLong.format(parseDate(iso));
export const formatDateShort = (iso) => fmtShort.format(parseDate(iso));
export const formatMonth = (iso) => fmtMonth.format(parseDate(`${iso.slice(0, 7)}-01`));
export const formatDateTime = (isoTs) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoTs));

const regionNames = new Intl.DisplayNames(['it'], { type: 'region' });

/** Nome della nazione in italiano dal codice ISO, con fallback sul nome originale. */
export function countryName(code, fallback = '') {
  if (!code) return fallback || 'Nazione sconosciuta';
  try { return regionNames.of(code) ?? fallback ?? code; } catch { return fallback || code; }
}

/** Emoji bandiera dal codice ISO (es. "IT" -> 🇮🇹). */
export function flag(code) {
  if (!/^[A-Z]{2}$/.test(code ?? '')) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Confronto alfabetico italiano, ignorando maiuscole e accenti. */
export const collator = new Intl.Collator('it', { sensitivity: 'base' });

/** localStorage "sicuro": non lancia eccezioni in navigazione privata o con storage bloccato. */
export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignorato */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignorato */ } },
};
