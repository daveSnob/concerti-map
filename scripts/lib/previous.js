// Gestione dei dati del precedente events.json: "ultimo dato valido" e archivio.

/**
 * Ricostruisce gli eventi del file precedente nel formato interno
 * (con l'oggetto `venue` al posto del solo venueId).
 */
export function expandPrevious(prev) {
  if (!prev?.events) return [];
  const venues = new Map((prev.venues ?? []).map((v) => [v.id, v]));
  return prev.events
    .filter((ev) => venues.has(ev.venueId))
    .map(({ id, venueId, ...ev }) => {
      const { id: _vid, ...venue } = venues.get(venueId);
      return { ...ev, venue };
    });
}

/**
 * Eventi futuri da recuperare dal file precedente perché la sorgente da cui venivano
 * ha fallito in questa esecuzione.
 * @param failures Map<source, Set<artistKey> | 'all'>
 * @param artistKeys chiavi degli artisti ancora monitorati
 */
export function selectFallback(prevEvents, failures, artistKeys, today) {
  return prevEvents.filter((ev) => ev.date >= today
    && artistKeys.has(ev.artistKey)
    && ev.sources.some((s) => {
      const f = failures.get(s);
      return f === 'all' || f?.has(ev.artistKey);
    }));
}

/** Eventi passati da conservare nell'archivio (entro `archiveDays` giorni). */
export function selectArchive(prevEvents, today, oldestDate) {
  return prevEvents.filter((ev) => ev.date < today && ev.date >= oldestDate);
}
