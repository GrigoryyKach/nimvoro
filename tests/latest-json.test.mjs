import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildManifest } from '../scripts/make-latest-json.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latest-json-'));
const sig = (name, text) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, text + '\n');
  return p;
};

test('builds the manifest the updater reads', () => {
  const m = buildManifest({
    version: 'v1.5.0',
    base: 'https://github.com/o/r/releases/download/v1.5.0/',
    notes: 'n',
    windows: `NIMVORO_1.5.0_x64-setup.exe=${sig('w.sig', 'WINSIG')}`,
    appimage: `NIMVORO-linux-x64.AppImage=${sig('a.sig', 'APPSIG')}`,
    deb: `NIMVORO-linux-x64.deb=${sig('d.sig', 'DEBSIG')}`,
    pubDate: '2026-11-20T00:00:00.000Z',
  });
  assert.equal(m.version, '1.5.0');
  assert.deepEqual(m.platforms['windows-x86_64'], { signature: 'WINSIG', url: 'https://github.com/o/r/releases/download/v1.5.0/NIMVORO_1.5.0_x64-setup.exe' });
  assert.equal(m.platforms['linux-x86_64-appimage'].signature, 'APPSIG');
  assert.equal(m.platforms['linux-x86_64'], undefined);
  assert.equal(m.platforms['linux-x86_64-deb'].signature, 'DEBSIG');
});

test('Windows only is allowed, a missing or empty signature is not', () => {
  const m = buildManifest({ version: '1.5.0', base: 'http://127.0.0.1:1', windows: `a-setup.exe=${sig('w2.sig', 'S')}` });
  assert.deepEqual(Object.keys(m.platforms), ['windows-x86_64']);
  assert.throws(() => buildManifest({ version: '1.5.0', base: 'http://x' }), /Windows/);
  assert.throws(() => buildManifest({ version: '1.5.0', base: 'http://x', windows: `a=${sig('e.sig', '')}` }), /empty signature/);
  assert.throws(() => buildManifest({ version: '1.5.0', base: 'http://x', windows: 'noequals' }), /expected/);
});
