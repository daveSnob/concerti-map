// Registro delle sorgenti di eventi. Per aggiungerne una nuova basta creare un modulo
// che esporti { name, isEnabled(env), fetchArtistEvents(artist, ctx) } e aggiungerlo qui.
import * as ticketmaster from './ticketmaster.js';
import * as bandsintown from './bandsintown.js';
import * as songkick from './songkick.js';

export const SOURCES = [ticketmaster, bandsintown, songkick];

/** Ordine di preferenza per scegliere il link al biglietto quando più fonti lo forniscono. */
export const TICKET_PRIORITY = ['ticketmaster', 'bandsintown', 'songkick'];
