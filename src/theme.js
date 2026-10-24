// Tema chiaro/scuro: automatico (segue il sistema), chiaro o scuro, scelto dall'utente.
import { storage } from './utils.js';

const KEY = 'concerti:theme';
const MODES = ['auto', 'light', 'dark'];
const LABELS = { auto: 'automatico', light: 'chiaro', dark: 'scuro' };
const ICONS = { auto: '◐', light: '☀', dark: '☾' };

function apply(mode) {
  if (mode === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  const btn = document.getElementById('theme-btn');
  btn.textContent = ICONS[mode];
  btn.title = `Tema: ${LABELS[mode]}`;
}

export function initTheme() {
  let mode = storage.get(KEY);
  if (!MODES.includes(mode)) mode = 'auto';
  apply(mode);
  document.getElementById('theme-btn').addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    if (mode === 'auto') storage.remove(KEY); else storage.set(KEY, mode);
    apply(mode);
  });
}
