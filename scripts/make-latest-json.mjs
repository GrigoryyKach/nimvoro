// Builds the updater manifest (latest.json) from the signature files of a release.
// Usage: node scripts/make-latest-json.mjs --version 1.5.0 --base https://github.com/OWNER/REPO/releases/download/v1.5.0 \
//          --windows NIMVORO_1.5.0_x64-setup.exe=sigs/NIMVORO_1.5.0_x64-setup.exe.sig \
//          [--appimage NIMVORO-linux-x64.AppImage=sigs/...sig] [--deb NIMVORO-linux-x64.deb=sigs/...sig] \
//          [--notes "text"] [--out latest.json]
// Each platform value is `<asset file name>=<path to its .sig file>`. The .sig content is stored as is (the plugin verifies it
// against the public key in tauri.conf.json). Entries without a value are left out.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function buildManifest({ version, base, notes = '', windows, appimage, deb, pubDate = new Date().toISOString() }) {
  if (!version || !base) throw new Error('version and base are required');
  if (!windows) throw new Error('the Windows installer is required');
  const entry = spec => {
    const i = spec.indexOf('=');
    if (i < 1) throw new Error(`expected <asset>=<sig file>, got "${spec}"`);
    const name = spec.slice(0, i);
    const signature = fs.readFileSync(spec.slice(i + 1), 'utf8').trim();
    if (!signature) throw new Error(`empty signature for ${name}`);
    return { signature, url: `${base.replace(/\/+$/, '')}/${encodeURIComponent(name)}` };
  };
  const platforms = { 'windows-x86_64': entry(windows) };
  if (appimage) {
    // No plain `linux-x86_64` fallback: a deb launcher must not be handed an AppImage.
    platforms['linux-x86_64-appimage'] = entry(appimage);
  }
  if (deb) platforms['linux-x86_64-deb'] = entry(deb);
  return { version: version.replace(/^v/, ''), notes, pub_date: pubDate, platforms };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const a = parseArgs(process.argv.slice(2));
  const manifest = buildManifest(a);
  fs.writeFileSync(a.out ?? 'latest.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(`latest.json: ${manifest.version}, platforms: ${Object.keys(manifest.platforms).join(', ')}`);
}
