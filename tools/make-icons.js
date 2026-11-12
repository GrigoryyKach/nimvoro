// Draws the NIMVORO suite icons: one coherent family (rounded square, same corner radius,
// flat with a subtle gradient), each app with its own colour and glyph.
//
// Run (any Electron works):
//   npx electron nimvoro/tools/make-icons.js <suite-root> [scratch-dir]
// <suite-root> is the OwnLauncher folder that contains `projects/` and `tasks/`.
// Writes assets/icon.png (512x512) and assets/icon.ico (16..256) into each utility repo,
// extra copies for Smart Switcher (build/icon.ico), a contact sheet to tasks/icons-preview.png,
// and SVG sources plus the launcher icon into the scratch dir (not into any repo).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
// The package is ESM; Electron's own module is loaded through require.
const { app, BrowserWindow } = createRequire(import.meta.url)('electron');

const FONT = 'Segoe UI, Arial, sans-serif';

// Wedge path for the wheel (centre cx,cy radius r, angles in degrees, 0 = up).
function wedge(cx, cy, r, a0, a1) {
  const p = a => {
    const t = (a - 90) * Math.PI / 180;
    return [(cx + r * Math.cos(t)).toFixed(2), (cy + r * Math.sin(t)).toFixed(2)];
  };
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`;
}
const wheelWedges = Array.from({ length: 6 }, (_, i) =>
  `<path d="${wedge(128, 136, 74, i * 60 + 2, i * 60 + 58)}" fill="#fff" fill-opacity="${i % 2 ? 0.42 : 1}"/>`).join('');

// Each icon: gradient stops (top-left to bottom-right) and a glyph in 256x256 space.
const ICONS = {
  'random-wheel': {
    repo: 'random_wheel',
    grad: ['#ffa43a', '#f0373c'],
    glyph: `
      <circle cx="128" cy="136" r="82" fill="#fff" fill-opacity="0.22"/>
      ${wheelWedges}
      <circle cx="128" cy="136" r="20" fill="#e5412c"/>
      <circle cx="128" cy="136" r="9" fill="#fff"/>
      <path d="M128 70 L108 36 L148 36 Z" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>`,
  },
  'save-urls': {
    repo: 'save_urls',
    grad: ['#14c8b4', '#2fb85a'],
    glyph: `
      <path d="M78 44 H178 a8 8 0 0 1 8 8 V208 L128 166 L70 208 V52 a8 8 0 0 1 8 -8 Z" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
      <g fill="none" stroke="#10a58f" stroke-width="12" stroke-linecap="round" transform="rotate(-45 128 98)">
        <rect x="86" y="82" width="52" height="32" rx="16"/>
        <rect x="118" y="82" width="52" height="32" rx="16"/>
      </g>`,
  },
  sidekick: {
    repo: 'transluent_AI',
    grad: ['#8b4dff', '#ff4fa3'],
    glyph: `
      <path d="M72 50 H184 a26 26 0 0 1 26 26 V150 a26 26 0 0 1 -26 26 H130 L86 212 V176 H72 a26 26 0 0 1 -26 -26 V76 a26 26 0 0 1 26 -26 Z" fill="#fff"/>
      <path d="M128 78 C131 108 141 118 172 113 C141 118 131 128 128 152 C125 128 115 118 84 113 C115 118 125 108 128 78 Z" fill="#a23fe8" stroke="#a23fe8" stroke-width="9" stroke-linejoin="round"/>
      <circle cx="176" cy="84" r="7" fill="#ff4fa3"/>`,
  },
  'smart-switcher': {
    repo: 'smart_switcher',
    grad: ['#2f7bff', '#16c9e8'],
    extra: ['build/icon.ico'],
    glyph: `
      <rect x="30" y="62" width="196" height="132" rx="30" fill="#fff"/>
      <text x="74" y="130" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="800" font-size="74" fill="#1f63e8">A</text>
      <text x="184" y="130" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="800" font-size="74" fill="#1f63e8">Я</text>
      <g fill="none" stroke="#1f63e8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M110 114 H146 M136 102 L148 114 L136 126"/>
        <path d="M146 148 H110 M120 136 L108 148 L120 160"/>
      </g>`,
  },
  'fps-overlay': {
    repo: 'FPS_counter',
    grad: ['#3a414d', '#12151a'],
    glyph: `
      <path d="M56 170 A82 82 0 1 1 200 170" fill="none" stroke="#39ff88" stroke-width="15" stroke-linecap="round"/>
      <g stroke="#39ff88" stroke-width="8" stroke-linecap="round" opacity="0.7">
        <line x1="70" y1="104" x2="82" y2="112"/>
        <line x1="128" y1="70" x2="128" y2="84"/>
        <line x1="186" y1="104" x2="174" y2="112"/>
      </g>
      <line x1="128" y1="156" x2="172" y2="106" stroke="#39ff88" stroke-width="13" stroke-linecap="round"/>
      <circle cx="128" cy="156" r="17" fill="#39ff88"/>
      <circle cx="128" cy="156" r="7" fill="#14181e"/>
      <rect x="86" y="200" width="84" height="10" rx="5" fill="#39ff88" opacity="0.45"/>`,
  },
};

// The launcher icon is not written into any repo; kept only so the family can be compared.
const LAUNCHER = {
  grad: ['#4f6bff', '#8a5bff'],
  glyph: `<path d="M70 196 V60 L186 196 V60" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>`,
};

function svg({ grad, glyph }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="252" height="252" rx="60" fill="url(#g)"/>
  <rect x="2" y="2" width="252" height="252" rx="60" fill="url(#hl)"/>
  ${glyph}
</svg>`;
}

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]);
}

const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.whenReady().then(async () => {
 try {
  const root = path.resolve(process.argv[2] || '.');
  const scratch = path.resolve(process.argv[3] || path.join(root, 'tasks', 'icons-src'));
  fs.mkdirSync(scratch, { recursive: true });
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');

  // Renders svg text at the given sizes; returns { size: Buffer }.
  const render = async (src, sizes) => {
    const urls = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(src).toString('base64'))};
      await img.decode();
      const res = {};
      for (const s of ${JSON.stringify(sizes)}) {
        const c = document.createElement('canvas');
        c.width = c.height = s;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, s, s);
        res[s] = c.toDataURL('image/png');
      }
      return res;
    })()`);
    return Object.fromEntries(sizes.map(s => [s, Buffer.from(urls[s].split(',')[1], 'base64')]));
  };

  const all = { ...ICONS, nimvoro: { ...LAUNCHER } };
  const rendered = {};
  for (const [id, def] of Object.entries(all)) {
    const src = svg(def);
    fs.writeFileSync(path.join(scratch, `${id}.svg`), src);
    const png = await render(src, [512, ...SIZES]);
    rendered[id] = png;
    fs.writeFileSync(path.join(scratch, `${id}.png`), png[512]);
    if (!def.repo) continue;
    const icoBuf = ico(SIZES.map(size => ({ size, data: png[size] })));
    const assets = path.join(root, 'projects', def.repo, 'assets');
    fs.mkdirSync(assets, { recursive: true });
    fs.writeFileSync(path.join(assets, 'icon.png'), png[512]);
    fs.writeFileSync(path.join(assets, 'icon.ico'), icoBuf);
    for (const extra of def.extra || []) {
      const p = path.join(root, 'projects', def.repo, extra);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, icoBuf);
    }
    console.log('icon ->', id, def.repo);
  }

  // Contact sheet: rows of 256, 32 and 16 px, on light and dark halves.
  const ids = Object.keys(ICONS);
  const sheet = await win.webContents.executeJavaScript(`(async () => {
    const ids = ${JSON.stringify(ids)};
    const data = ${JSON.stringify(Object.fromEntries(ids.map(id => [id, {
      256: 'data:image/png;base64,' + rendered[id][256].toString('base64'),
    }])))};
    const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const imgs = {};
    for (const id of ids) imgs[id] = await load(data[id][256]);
    const colW = 290, W = colW * ids.length + 20, H = 256 + 40 + 2 * 120;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#f3f4f8'; g.fillRect(0, 0, W / 2, H);
    g.fillStyle = '#16181f'; g.fillRect(W / 2, 0, W / 2, H);
    g.imageSmoothingQuality = 'high';
    ids.forEach((id, i) => {
      const x = 20 + i * colW;
      g.drawImage(imgs[id], x, 20, 256, 256);
      for (const s of [32, 16]) {
        const y = s === 32 ? 300 : 360;
        g.drawImage(imgs[id], x, y, s, s);
        g.drawImage(imgs[id], x + 60, y, s, s);
      }
      g.fillStyle = i * colW + 20 < W / 2 ? '#222' : '#ddd';
      g.font = '15px Segoe UI'; g.fillText(id, x, 440);
    });
    return c.toDataURL('image/png');
  })()`);
  fs.writeFileSync(path.join(root, 'tasks', 'icons-preview.png'), Buffer.from(sheet.split(',')[1], 'base64'));
} catch (e) { console.error(e); process.exitCode = 1; }
  app.quit();
});
