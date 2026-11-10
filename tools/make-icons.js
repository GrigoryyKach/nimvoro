// Рисует иконки набора NIMVORO в едином стиле (градиентный скруглённый квадрат + белый знак)
// и сохраняет PNG 256×256 и многоразмерный ICO.
//
// Запуск (нужен любой Electron):  npx electron tools/make-icons.js <папка-вывода>
// В папке появятся <id>.png и <id>.ico для каждого инструмента.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const GRAD = ['#4f6bff', '#8a5bff'];

// Знаки рисуются в системе координат 256×256.
const GLYPHS = {
  'random-wheel': `
    <circle cx="128" cy="140" r="70" fill="none" stroke="#fff" stroke-width="12"/>
    <circle cx="128" cy="140" r="18" fill="#fff"/>
    <g stroke="#fff" stroke-width="9" stroke-linecap="round">
      <line x1="128" y1="140" x2="128" y2="74"/>
      <line x1="128" y1="140" x2="185" y2="173"/>
      <line x1="128" y1="140" x2="71" y2="173"/>
    </g>
    <path d="M128 72 L110 44 L146 44 Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`,
  'save-urls': `
    <g fill="none" stroke="#fff" stroke-width="15" transform="rotate(-45 128 128)">
      <rect x="44" y="96" width="98" height="64" rx="32"/>
      <rect x="114" y="96" width="98" height="64" rx="32"/>
    </g>`,
  'smart-switcher': `
    <text x="128" y="132" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI, Arial, sans-serif"
      font-weight="800" font-size="118" fill="#fff" letter-spacing="-4">Aa</text>`,
  transluent: `
    <rect x="52" y="62" width="120" height="96" rx="22" fill="#fff" fill-opacity="0.38"/>
    <rect x="84" y="94" width="120" height="96" rx="22" fill="none" stroke="#fff" stroke-width="12"/>
    <path d="M84 190 L84 214 L112 190" fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>
    <path d="M144 112 C146 132 152 138 172 141 C152 144 146 150 144 170 C142 150 136 144 116 141 C136 138 142 132 144 112 Z" fill="#fff"/>`,
  'fps-overlay': `
    <path d="M58 158 A72 72 0 1 1 198 158" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round"/>
    <g stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.75">
      <line x1="80" y1="96" x2="90" y2="104"/>
      <line x1="128" y1="74" x2="128" y2="86"/>
      <line x1="176" y1="96" x2="166" y2="104"/>
    </g>
    <line x1="128" y1="150" x2="168" y2="104" stroke="#fff" stroke-width="11" stroke-linecap="round"/>
    <circle cx="128" cy="150" r="15" fill="#fff"/>
    <text x="128" y="206" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800"
      font-size="40" fill="#fff" letter-spacing="3">FPS</text>`,
  nimvoro: `
    <path d="M70 196 V60 L186 196 V60" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
`,
};

function svg(glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GRAD[0]}"/><stop offset="1" stop-color="${GRAD[1]}"/>
    </linearGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
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

app.whenReady().then(async () => {
  const out = path.resolve(process.argv[process.argv.length - 1]);
  fs.mkdirSync(out, { recursive: true });
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  for (const [id, glyph] of Object.entries(GLYPHS)) {
    const src = svg(glyph);
    fs.writeFileSync(path.join(out, `${id}.svg`), src);
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const dataUrls = await win.webContents.executeJavaScript(`(async () => {
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
    const pngs = sizes.map(size => ({ size, data: Buffer.from(dataUrls[size].split(',')[1], 'base64') }));
    fs.writeFileSync(path.join(out, `${id}.png`), pngs.find(p => p.size === 256).data);
    fs.writeFileSync(path.join(out, `${id}-128.png`), pngs.find(p => p.size === 128).data);
    fs.writeFileSync(path.join(out, `${id}-32.png`), pngs.find(p => p.size === 32).data);
    fs.writeFileSync(path.join(out, `${id}.ico`), ico(pngs.filter(p => [16, 24, 32, 48, 64, 256].includes(p.size))));
    console.log('icon →', id);
  }
  app.quit();
});
