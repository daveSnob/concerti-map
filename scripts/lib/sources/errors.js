// Errori condivisi dagli adapter delle sorgenti.
import { HttpError } from '../http.js';

/**
 * Errore "fatale" per la sorgente: chiave non valida, accesso negato, quota esaurita.
 * Interrompe tutte le richieste a quella sorgente per questa esecuzione
 * (inutile ripetere 500 chiamate destinate a fallire).
 */
export class FatalSourceError extends Error {}

/** Converte gli errori di autenticazione/quota in FatalSourceError. */
export function asFatalIfAuth(err) {
  if (err instanceof HttpError && [401, 403, 429].includes(err.status)) {
    return new FatalSourceError(err.message);
  }
  return err;
}
