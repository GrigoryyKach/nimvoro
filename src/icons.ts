// Line icons 20x20 (stroke = currentColor).
const wrap = (d: string, extra = '') =>
  `<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icons = {
  refresh: wrap('<path d="M16 10a6 6 0 1 1-1.8-4.3"/><path d="M16 3.5V6.5H13"/>'),
  // Cog: toothed outline plus a hub (24x24 path scaled to the 20x20 box).
  gear: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  minimize: wrap('<path d="M5 10h10"/>'),
  maximize: wrap('<rect x="5" y="5" width="10" height="10" rx="1.5"/>'),
  close: wrap('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>'),
  grid: wrap('<rect x="3.5" y="3.5" width="5" height="5" rx="1"/><rect x="11.5" y="3.5" width="5" height="5" rx="1"/><rect x="3.5" y="11.5" width="5" height="5" rx="1"/><rect x="11.5" y="11.5" width="5" height="5" rx="1"/>'),
  list: wrap('<path d="M4 5.5h12M4 10h12M4 14.5h12"/>'),
  search: wrap('<circle cx="9" cy="9" r="5"/><path d="M13 13l3.5 3.5"/>'),
  folder: wrap('<path d="M3 6.5a1.5 1.5 0 0 1 1.5-1.5h3.2l1.6 1.8h6.2A1.5 1.5 0 0 1 17 8.3v6.2a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5z"/>'),
  more: wrap('<circle cx="5" cy="10" r="0.6" fill="currentColor"/><circle cx="10" cy="10" r="0.6" fill="currentColor"/><circle cx="15" cy="10" r="0.6" fill="currentColor"/>'),
  external: wrap('<path d="M8 4.5H5a1 1 0 0 0-1 1V15a1 1 0 0 0 1 1h9.5a1 1 0 0 0 1-1v-3"/><path d="M11.5 4H16v4.5M16 4l-7 7"/>'),
  arrowLeft: wrap('<path d="M12 4.5L6.5 10l5.5 5.5"/>'),
  arrowRight: wrap('<path d="M8 4.5l5.5 5.5L8 15.5"/>'),
  download: wrap('<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12"/>'),
  play: wrap('<path d="M6.5 4.5v11l9-5.5z"/>'),
  trash: wrap('<path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10"/>'),
  info: wrap('<circle cx="10" cy="10" r="7"/><path d="M10 9v4.5M10 6.5v.2"/>'),
  check: wrap('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>'),
  sparkle: wrap('<path d="M10 3c.6 3.6 1.4 4.4 5 5-3.6.6-4.4 1.4-5 5-.6-3.6-1.4-4.4-5-5 3.6-.6 4.4-1.4 5-5z"/>'),
  alert: wrap('<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.5M10 14v.2"/>'),
};

/** NIMVORO logo: same shape as the tool icons. */
export const logo = `<svg viewBox="0 0 256 256" width="24" height="24"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f6bff"/><stop offset="1" stop-color="#8a5bff"/></linearGradient></defs><rect x="2" y="2" width="252" height="252" rx="60" fill="url(#lg)"/><path d="M70 196V60L186 196V60" fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
