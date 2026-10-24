// Utility HTTP condivise: fetch con timeout, retry con backoff e throttling.
// Usa il fetch nativo di Node (>= 18), quindi nessuna dipendenza esterna.

/** Errore HTTP con lo status code, utile per decidere se ritentare. */
export class HttpError extends Error {
  constructor(status, url, body = '', retryAfter = null) {
    super(`HTTP ${status} su ${redact(url)}${body ? `: ${body.slice(0, 200)}` : ''}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Nasconde le chiavi API dagli URL prima di scriverli nei log. */
export function redact(url) {
  return String(url).replace(/(apikey|app_id|api_key|client_secret)=[^&]+/gi, '$1=***');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Crea un "throttle": garantisce almeno `minIntervalMs` tra due chiamate.
 * Serve per rispettare i limiti delle API (es. Nominatim: 1 richiesta/secondo).
 */
export function createThrottle(minIntervalMs) {
  let last = 0;
  let queue = Promise.resolve();
  return function throttle() {
    queue = queue.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    return queue;
  };
}

/**
 * Esegue una richiesta e restituisce il JSON.
 * - ritenta sugli errori di rete, 429 e 5xx (backoff esponenziale o Retry-After);
 * - non ritenta sugli altri 4xx (chiave errata, artista inesistente...).
 */
export async function fetchJson(url, { retries = 3, timeoutMs = 15000, throttle, ...init } = {}) {
  let attempt = 0;
  for (;;) {
    if (throttle) await throttle();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
        throw new HttpError(res.status, url, text, Number.isFinite(retryAfter) ? retryAfter : null);
      }
      return text ? JSON.parse(text) : null;
    } catch (err) {
      const retriable = !(err instanceof HttpError) || err.status === 429 || err.status >= 500;
      if (!retriable || attempt >= retries) throw err;
      attempt += 1;
      // Attesa: Retry-After (max 60s) se il server lo indica, altrimenti 1s, 2s, 4s...
      const waitMs = err.retryAfter ? Math.min(err.retryAfter, 60) * 1000 : 1000 * 2 ** (attempt - 1);
      await sleep(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }
}
